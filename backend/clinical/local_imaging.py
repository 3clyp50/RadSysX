from __future__ import annotations

import gzip
import json
import math
import re
import shutil
import struct
from collections import defaultdict
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path, PurePosixPath
from uuid import uuid4

import pydicom
from fastapi import HTTPException
from pydicom.tag import Tag

from .config import ClinicalPlatformSettings
from .contracts import (
    LocalImagingImportResponse,
    LocalImagingImportedStudy,
    LocalImagingStudyAsset,
    LocalImagingStudyAssetsResponse,
    LocalImagingStudyFinding,
)
from .repositories import ClinicalRepository

DICOMDIR_SOP_CLASS_UID = "1.2.840.10008.1.3.10"
COMMON_IMAGE_EXTENSIONS = {"bmp", "gif", "jpg", "jpeg", "png", "tif", "tiff"}
PREVIEW_IMAGE_MEDIA_TYPES = {
    "bmp": "image/bmp",
    "gif": "image/gif",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
}
NIFTI_PREVIEW_MAX_DIMENSION = 96
NIFTI_NUMERIC_DATATYPES: dict[int, tuple[str, int]] = {
    2: ("B", 1),
    4: ("h", 2),
    8: ("i", 4),
    16: ("f", 4),
    64: ("d", 8),
    256: ("b", 1),
    512: ("H", 2),
    768: ("I", 4),
}


@dataclass(frozen=True)
class LocalImagingUploadPart:
    filename: str
    content_type: str | None
    relative_path: str | None
    data: bytes


@dataclass(frozen=True)
class _DetectedFile:
    original_name: str
    relative_path: str
    stored_path: str
    size: int
    format: str
    study_instance_uid: str | None = None
    series_instance_uid: str | None = None
    sop_instance_uid: str | None = None
    modality: str | None = None


@dataclass(frozen=True)
class LocalDicomInstance:
    study_instance_uid: str
    series_instance_uid: str
    sop_instance_uid: str
    stored_path: str


@dataclass(frozen=True)
class LocalImagingPreview:
    content: bytes
    media_type: str


class LocalImagingImporter:
    def __init__(
        self,
        settings: ClinicalPlatformSettings,
        repository: ClinicalRepository,
    ) -> None:
        self._settings = settings
        self._repository = repository

    def import_uploads(
        self,
        uploads: list[LocalImagingUploadPart],
    ) -> LocalImagingImportResponse:
        import_id = f"import-{uuid4()}"
        import_root = Path(self._settings.local_imaging_storage_dir) / import_id
        import_root.mkdir(parents=True, exist_ok=False)

        warnings: list[str] = []
        detected_files: list[_DetectedFile] = []
        rejected_files = 0

        try:
            for index, upload in enumerate(uploads, start=1):
                detected = self._store_and_detect(upload, import_root, index)
                if detected.format == "unknown":
                    rejected_files += 1
                    warnings.append(f"Skipped unsupported file at position {index}.")
                    continue

                detected_files.append(detected)

            warnings.extend(self._dicomdir_warnings(detected_files))
            studies, file_study_uids = self._register_studies(import_id, detected_files, warnings)
            self._write_manifest(import_root, import_id, detected_files, studies, file_study_uids, warnings)
        except Exception:
            shutil.rmtree(import_root, ignore_errors=True)
            raise

        return LocalImagingImportResponse(
            import_id=import_id,
            imported_studies=studies,
            accepted_files=len(detected_files),
            rejected_files=rejected_files,
            warnings=warnings,
        )

    def _store_and_detect(
        self,
        upload: LocalImagingUploadPart,
        import_root: Path,
        index: int,
    ) -> _DetectedFile:
        relative_path = self._safe_relative_path(upload.relative_path or upload.filename)
        safe_name = f"{index:04d}-{self._safe_filename(Path(relative_path).name)}"
        stored_path = import_root / safe_name
        stored_path.write_bytes(upload.data)

        detected = self._detect_file(upload, relative_path, stored_path.as_posix())
        return detected

    def _detect_file(
        self,
        upload: LocalImagingUploadPart,
        relative_path: str,
        stored_path: str,
    ) -> _DetectedFile:
        file_name = Path(relative_path).name
        upper_name = file_name.upper()
        lower_name = file_name.lower()
        extension = self._extension(lower_name)

        dicom_dataset = self._read_dicom_metadata(upload.data, force=upper_name == "DICOMDIR")
        if dicom_dataset is not None:
            sop_class_uid = str(getattr(dicom_dataset, "SOPClassUID", ""))
            if upper_name == "DICOMDIR" or sop_class_uid == DICOMDIR_SOP_CLASS_UID:
                return _DetectedFile(
                    original_name=file_name,
                    relative_path=relative_path,
                    stored_path=stored_path,
                    size=len(upload.data),
                    format="dicomdir",
                )

            return _DetectedFile(
                original_name=file_name,
                relative_path=relative_path,
                stored_path=stored_path,
                size=len(upload.data),
                format="dicom",
                study_instance_uid=self._clean_uid(getattr(dicom_dataset, "StudyInstanceUID", None)),
                series_instance_uid=self._clean_uid(getattr(dicom_dataset, "SeriesInstanceUID", None)),
                sop_instance_uid=self._clean_uid(getattr(dicom_dataset, "SOPInstanceUID", None)),
                modality=self._safe_modality(getattr(dicom_dataset, "Modality", None)),
            )

        if self._is_nifti(upload.data, lower_name):
            return _DetectedFile(
                original_name=file_name,
                relative_path=relative_path,
                stored_path=stored_path,
                size=len(upload.data),
                format="nifti",
                modality="NIFTI",
            )

        if extension in COMMON_IMAGE_EXTENSIONS:
            return _DetectedFile(
                original_name=file_name,
                relative_path=relative_path,
                stored_path=stored_path,
                size=len(upload.data),
                format=extension,
                modality="IMG",
            )

        return _DetectedFile(
            original_name=file_name,
            relative_path=relative_path,
            stored_path=stored_path,
            size=len(upload.data),
            format="unknown",
        )

    def _register_studies(
        self,
        import_id: str,
        detected_files: list[_DetectedFile],
        warnings: list[str],
    ) -> tuple[list[LocalImagingImportedStudy], dict[str, str]]:
        if not detected_files:
            return [], {}

        grouped: dict[str, list[_DetectedFile]] = defaultdict(list)
        file_study_uids: dict[str, str] = {}
        generated_study_uid = self._generated_uid()
        primary_dicom_study_uid = next(
            (
                file.study_instance_uid
                for file in detected_files
                if file.format == "dicom" and file.study_instance_uid
            ),
            None,
        )

        for detected in detected_files:
            if detected.format == "dicom" and detected.study_instance_uid:
                study_uid = detected.study_instance_uid
            elif detected.format == "dicomdir" and primary_dicom_study_uid:
                study_uid = primary_dicom_study_uid
            else:
                study_uid = generated_study_uid
            grouped[study_uid].append(detected)
            file_study_uids[detected.stored_path] = study_uid

        studies: list[LocalImagingImportedStudy] = []
        for study_uid, files in grouped.items():
            formats = sorted({file.format for file in files})
            modality = self._study_modality(files)
            accession_number = f"LOCAL-{import_id.removeprefix('import-')[:8].upper()}"
            if len(grouped) > 1:
                accession_number = f"{accession_number}-{len(studies) + 1}"

            summary = LocalImagingImportedStudy(
                study_instance_uid=study_uid,
                accession_number=accession_number,
                modality=modality,
                description=self._study_description(formats, len(files)),
                archive_ref=f"local://{import_id}/studies/{study_uid}",
                file_count=len(files),
                formats=formats,
                warnings=self._study_warnings(files, warnings),
            )
            self._repository.register_local_imported_study(summary)
            studies.append(summary)

        return studies, file_study_uids

    def _write_manifest(
        self,
        import_root: Path,
        import_id: str,
        detected_files: list[_DetectedFile],
        studies: list[LocalImagingImportedStudy],
        file_study_uids: dict[str, str],
        warnings: list[str],
    ) -> None:
        manifest = {
            "importId": import_id,
            "acceptedFiles": len(detected_files),
            "studies": [study.model_dump(by_alias=True) for study in studies],
            "files": [
                {
                    "relativePath": file.relative_path,
                    "storedPath": file.stored_path,
                    "size": file.size,
                    "format": file.format,
                    "studyInstanceUID": file.study_instance_uid,
                    "localStudyInstanceUID": file_study_uids.get(file.stored_path),
                    "seriesInstanceUID": file.series_instance_uid,
                    "sopInstanceUID": file.sop_instance_uid,
                    "modality": file.modality,
                }
                for file in detected_files
            ],
            "warnings": warnings,
        }
        (import_root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    def list_dicom_instances(
        self,
        *,
        study_instance_uid: str | None = None,
        series_instance_uid: str | None = None,
        sop_instance_uid: str | None = None,
    ) -> list[LocalDicomInstance]:
        instances: list[LocalDicomInstance] = []
        for manifest in self._iter_manifests():
            for file_entry in manifest.get("files", []):
                if file_entry.get("format") != "dicom":
                    continue
                instance = LocalDicomInstance(
                    study_instance_uid=str(file_entry.get("studyInstanceUID") or ""),
                    series_instance_uid=str(file_entry.get("seriesInstanceUID") or ""),
                    sop_instance_uid=str(file_entry.get("sopInstanceUID") or ""),
                    stored_path=str(file_entry.get("storedPath") or ""),
                )
                if not all(
                    [instance.study_instance_uid, instance.series_instance_uid, instance.sop_instance_uid]
                ):
                    continue
                if study_instance_uid and instance.study_instance_uid != study_instance_uid:
                    continue
                if series_instance_uid and instance.series_instance_uid != series_instance_uid:
                    continue
                if sop_instance_uid and instance.sop_instance_uid != sop_instance_uid:
                    continue
                instances.append(instance)
        return instances

    def dicom_json_metadata(
        self,
        *,
        study_instance_uid: str,
        series_instance_uid: str | None = None,
        sop_instance_uid: str | None = None,
    ) -> list[dict]:
        return [
            self._dicom_json_for_instance(instance)
            for instance in self.list_dicom_instances(
                study_instance_uid=study_instance_uid,
                series_instance_uid=series_instance_uid,
                sop_instance_uid=sop_instance_uid,
            )
        ]

    def read_dicom_instance(
        self,
        study_instance_uid: str,
        series_instance_uid: str,
        sop_instance_uid: str,
    ) -> bytes:
        instance = self._require_instance(study_instance_uid, series_instance_uid, sop_instance_uid)
        return Path(instance.stored_path).read_bytes()

    def read_bulk_data(
        self,
        study_instance_uid: str,
        series_instance_uid: str,
        sop_instance_uid: str,
        tag: str,
    ) -> bytes:
        instance = self._require_instance(study_instance_uid, series_instance_uid, sop_instance_uid)
        dataset = pydicom.dcmread(instance.stored_path, force=False)
        try:
            data_element = dataset.get(Tag(tag))
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Bulk data tag is invalid.") from exc
        if data_element is None:
            raise HTTPException(status_code=404, detail="Bulk data element was not found.")
        value = data_element.value
        if isinstance(value, bytes):
            return value
        if isinstance(value, bytearray):
            return bytes(value)
        raise HTTPException(status_code=415, detail="Requested element is not binary bulk data.")

    def read_frame(
        self,
        study_instance_uid: str,
        series_instance_uid: str,
        sop_instance_uid: str,
        frame_number: int,
    ) -> bytes:
        if frame_number < 1:
            raise HTTPException(status_code=400, detail="Frame numbers are one-based.")
        instance = self._require_instance(study_instance_uid, series_instance_uid, sop_instance_uid)
        dataset = pydicom.dcmread(instance.stored_path, force=False)
        pixel_data = getattr(dataset, "PixelData", None)
        if pixel_data is None:
            raise HTTPException(status_code=404, detail="Pixel data was not found for this instance.")

        number_of_frames = int(getattr(dataset, "NumberOfFrames", 1) or 1)
        if frame_number > number_of_frames:
            raise HTTPException(status_code=404, detail="Frame was not found.")

        frame_size = self._uncompressed_frame_size(dataset)
        if frame_size is None:
            if frame_number == 1:
                return bytes(pixel_data)
            raise HTTPException(status_code=415, detail="Compressed multi-frame retrieval is not available locally.")

        start = (frame_number - 1) * frame_size
        end = start + frame_size
        frame = bytes(pixel_data[start:end])
        if not frame:
            raise HTTPException(status_code=404, detail="Frame data was not found.")
        return frame

    def study_assets(self, study_instance_uid: str) -> LocalImagingStudyAssetsResponse:
        for manifest in self._iter_manifests():
            study = self._find_manifest_study(manifest, study_instance_uid)
            if study is None:
                continue

            file_entries = [
                (file_index, file_entry)
                for file_index, file_entry in enumerate(manifest.get("files", []))
                if self._manifest_file_belongs_to_study(file_entry, study, manifest)
            ]
            study_file_entries = [file_entry for _, file_entry in file_entries]
            assets = [
                self._asset_from_manifest_entry(
                    manifest=manifest,
                    file_entry_index=file_index,
                    file_entry=file_entry,
                    study_instance_uid=study_instance_uid,
                )
                for file_index, file_entry in file_entries
            ]
            findings, analysis_warnings = self._study_findings(study_file_entries)
            warnings = [str(warning) for warning in study.get("warnings", []) if warning]
            warnings.extend(analysis_warnings)
            formats = [str(file_format) for file_format in study.get("formats", []) if file_format]
            if not formats:
                formats = sorted({asset.format for asset in assets})

            return LocalImagingStudyAssetsResponse(
                study_instance_uid=study_instance_uid,
                archive_ref=str(study.get("archiveRef") or f"local://unknown/studies/{study_instance_uid}"),
                modality=str(study.get("modality") or "LOCAL"),
                description=str(study.get("description") or "Local imaging import"),
                file_count=int(study.get("fileCount") or len(assets)),
                formats=formats,
                summary=self._study_summary(formats, assets),
                findings=findings,
                assets=assets,
                warnings=warnings,
            )

        raise HTTPException(status_code=404, detail="Local imaging study was not found.")

    def preview_asset(self, study_instance_uid: str, asset_id: str) -> LocalImagingPreview:
        _, _, file_entry = self._resolve_asset_entry(study_instance_uid, asset_id)
        file_format = str(file_entry.get("format") or "unknown")

        media_type = PREVIEW_IMAGE_MEDIA_TYPES.get(file_format)
        if file_format == "nifti":
            return self._nifti_preview(file_entry)
        if media_type is None:
            raise HTTPException(status_code=415, detail="Local imaging asset preview is not available.")

        path = self._stored_file_path(file_entry)
        if path is None:
            raise HTTPException(status_code=404, detail="Local imaging asset is missing from storage.")

        try:
            return LocalImagingPreview(content=path.read_bytes(), media_type=media_type)
        except OSError as exc:
            raise HTTPException(status_code=404, detail="Local imaging asset is missing from storage.") from exc

    def _dicomdir_warnings(self, detected_files: list[_DetectedFile]) -> list[str]:
        warnings: list[str] = []
        dicomdir_files = [file for file in detected_files if file.format == "dicomdir"]
        if not dicomdir_files:
            return warnings

        available_paths = {file.relative_path.upper() for file in detected_files}
        available_names = {Path(file.relative_path).name.upper() for file in detected_files}

        for dicomdir_file in dicomdir_files:
            try:
                dataset = pydicom.dcmread(dicomdir_file.stored_path, stop_before_pixels=True)
            except Exception:
                warnings.append("DICOMDIR was accepted, but its directory records could not be read.")
                continue

            referenced = self._dicomdir_referenced_paths(dataset)
            missing = [
                path
                for path in referenced
                if path.upper() not in available_paths and Path(path).name.upper() not in available_names
            ]
            if missing:
                warnings.append(
                    f"DICOMDIR references {len(missing)} file(s) that were not included in the import.",
                )

        return warnings

    def _iter_manifests(self):
        storage_root = Path(self._settings.local_imaging_storage_dir)
        if not storage_root.exists():
            return
        for manifest_path in sorted(storage_root.glob("import-*/manifest.json")):
            try:
                yield json.loads(manifest_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue

    @staticmethod
    def _find_manifest_study(manifest: dict, study_instance_uid: str) -> dict | None:
        for study in manifest.get("studies", []):
            if str(study.get("studyInstanceUID") or "") == study_instance_uid:
                return study
        return None

    @staticmethod
    def _manifest_file_belongs_to_study(file_entry: dict, study: dict, manifest: dict) -> bool:
        target_uid = str(study.get("studyInstanceUID") or "")
        local_study_uid = str(file_entry.get("localStudyInstanceUID") or "")
        source_study_uid = str(file_entry.get("studyInstanceUID") or "")
        if local_study_uid == target_uid or source_study_uid == target_uid:
            return True

        file_format = str(file_entry.get("format") or "")
        study_formats = {str(format_name) for format_name in study.get("formats", [])}
        if file_format not in study_formats:
            return False

        manifest_studies = manifest.get("studies", []) or []
        if len(manifest_studies) == 1:
            return True
        if file_format == "dicomdir":
            return True
        return file_format != "dicom" and not source_study_uid

    def _asset_from_manifest_entry(
        self,
        *,
        manifest: dict,
        file_entry_index: int,
        file_entry: dict,
        study_instance_uid: str,
    ) -> LocalImagingStudyAsset:
        file_format = str(file_entry.get("format") or "unknown")
        study_uid = str(
            file_entry.get("studyInstanceUID")
            or file_entry.get("localStudyInstanceUID")
            or "",
        ) or None
        series_uid = str(file_entry.get("seriesInstanceUID") or "") or None
        sop_uid = str(file_entry.get("sopInstanceUID") or "") or None
        viewer_supported = bool(file_format == "dicom" and study_uid and series_uid and sop_uid)
        asset_id = self._asset_id(manifest, file_entry_index)
        preview_supported = self._preview_supported(file_format)
        return LocalImagingStudyAsset(
            asset_id=asset_id,
            relative_path=str(file_entry.get("relativePath") or "local-file"),
            format=file_format,
            modality=str(file_entry.get("modality") or "") or None,
            size=int(file_entry.get("size") or 0),
            study_instance_uid=study_uid,
            series_instance_uid=series_uid,
            sop_instance_uid=sop_uid,
            analysis_supported=file_format in {"dicom", "dicomdir", "nifti", *COMMON_IMAGE_EXTENSIONS},
            viewer_supported=viewer_supported,
            preview_supported=preview_supported,
            preview_url=(
                f"/api/local-imaging/studies/{study_instance_uid}/assets/{asset_id}/preview"
                if preview_supported
                else None
            ),
        )

    def _resolve_asset_entry(
        self,
        study_instance_uid: str,
        asset_id: str,
    ) -> tuple[dict, int, dict]:
        parsed = self._parse_asset_id(asset_id)
        if parsed is None:
            raise HTTPException(status_code=404, detail="Local imaging asset was not found.")

        import_id, file_index = parsed
        for manifest in self._iter_manifests():
            if str(manifest.get("importId") or "") != import_id:
                continue
            study = self._find_manifest_study(manifest, study_instance_uid)
            if study is None:
                raise HTTPException(status_code=404, detail="Local imaging study was not found.")
            files = manifest.get("files", []) or []
            if file_index < 0 or file_index >= len(files):
                raise HTTPException(status_code=404, detail="Local imaging asset was not found.")
            file_entry = files[file_index]
            if not self._manifest_file_belongs_to_study(file_entry, study, manifest):
                raise HTTPException(status_code=404, detail="Local imaging asset was not found.")
            return manifest, file_index, file_entry

        raise HTTPException(status_code=404, detail="Local imaging asset was not found.")

    def _study_findings(
        self,
        file_entries: list[dict],
    ) -> tuple[list[LocalImagingStudyFinding], list[str]]:
        findings: list[LocalImagingStudyFinding] = []
        warnings: list[str] = []
        total_size = sum(int(file_entry.get("size") or 0) for file_entry in file_entries)
        findings.append(LocalImagingStudyFinding(label="Files", value=str(len(file_entries))))
        findings.append(LocalImagingStudyFinding(label="Stored size", value=self._human_size(total_size)))

        dicom_entries = [entry for entry in file_entries if entry.get("format") == "dicom"]
        if dicom_entries:
            series_uids = {
                str(entry.get("seriesInstanceUID"))
                for entry in dicom_entries
                if entry.get("seriesInstanceUID")
            }
            findings.append(LocalImagingStudyFinding(label="DICOM instances", value=str(len(dicom_entries))))
            findings.append(LocalImagingStudyFinding(label="DICOM series", value=str(len(series_uids))))

        dicomdir_entries = [entry for entry in file_entries if entry.get("format") == "dicomdir"]
        if dicomdir_entries:
            findings.append(LocalImagingStudyFinding(label="DICOMDIR files", value=str(len(dicomdir_entries))))

        nifti_entries = [entry for entry in file_entries if entry.get("format") == "nifti"]
        for nifti_entry in nifti_entries:
            header = self._read_nifti_header(nifti_entry)
            relative_path = str(nifti_entry.get("relativePath") or "NIFTI volume")
            if header is None:
                warnings.append(f"NIFTI header could not be read for {Path(relative_path).name}.")
                continue

            dimensions = header["dimensions"]
            dimension_text = " x ".join(str(value) for value in dimensions) if dimensions else "header detected"
            datatype = header["datatypeCode"]
            bitpix = header["bitsPerVoxel"]
            findings.append(
                LocalImagingStudyFinding(
                    label="NIFTI volume",
                    value=f"{dimension_text} voxels; datatype {datatype}; {bitpix} bits/voxel",
                )
            )

        image_entries = [
            entry
            for entry in file_entries
            if str(entry.get("format") or "") in COMMON_IMAGE_EXTENSIONS
        ]
        if image_entries:
            findings.append(LocalImagingStudyFinding(label="Image files", value=str(len(image_entries))))

        return findings, warnings

    def _read_nifti_header(self, file_entry: dict) -> dict[str, object] | None:
        path = self._stored_file_path(file_entry)
        if path is None:
            return None

        lower_name = str(file_entry.get("relativePath") or path.name).lower()
        try:
            if lower_name.endswith(".nii.gz") or path.name.lower().endswith(".gz"):
                with gzip.open(path, "rb") as handle:
                    header = handle.read(352)
            else:
                with path.open("rb") as handle:
                    header = handle.read(352)
        except (OSError, EOFError, gzip.BadGzipFile):
            return None

        return self._parse_nifti_header(header)

    def _nifti_preview(self, file_entry: dict) -> LocalImagingPreview:
        payload = self._read_nifti_file_bytes(file_entry)
        if payload is None:
            raise HTTPException(status_code=422, detail="NIFTI asset could not be read.")

        header = self._parse_nifti_header(payload[:352])
        if header is None:
            raise HTTPException(status_code=422, detail="NIFTI header could not be read.")
        if header.get("magic") != "n+1":
            raise HTTPException(
                status_code=415,
                detail="Paired NIFTI preview is not available for local imports.",
            )

        dimensions = [int(value) for value in header.get("dimensions", [])]
        if len(dimensions) < 2:
            raise HTTPException(status_code=422, detail="NIFTI dimensions are not previewable.")

        width = dimensions[0]
        height = dimensions[1]
        depth = dimensions[2] if len(dimensions) >= 3 else 1
        if width < 1 or height < 1 or depth < 1:
            raise HTTPException(status_code=422, detail="NIFTI dimensions are not previewable.")

        datatype = int(header.get("datatypeCode") or 0)
        decoder = NIFTI_NUMERIC_DATATYPES.get(datatype)
        if decoder is None:
            raise HTTPException(status_code=415, detail="NIFTI datatype is not previewable.")

        voxel_offset = float(header.get("voxOffset") or 352.0)
        if not math.isfinite(voxel_offset) or voxel_offset < 0:
            voxel_offset = 352.0
        data_offset = max(int(voxel_offset), 352)
        if data_offset >= len(payload):
            raise HTTPException(status_code=422, detail="NIFTI voxel data is missing.")

        format_code, bytes_per_voxel = decoder
        slice_index = min(depth - 1, depth // 2)
        svg = self._nifti_slice_svg(
            payload=payload,
            data_offset=data_offset,
            endian=str(header.get("endian") or "<"),
            format_code=format_code,
            bytes_per_voxel=bytes_per_voxel,
            width=width,
            height=height,
            slice_index=slice_index,
        )
        return LocalImagingPreview(content=svg, media_type="image/svg+xml")

    def _read_nifti_file_bytes(self, file_entry: dict) -> bytes | None:
        path = self._stored_file_path(file_entry)
        if path is None:
            return None

        lower_name = str(file_entry.get("relativePath") or path.name).lower()
        try:
            if lower_name.endswith(".nii.gz") or path.name.lower().endswith(".gz"):
                with gzip.open(path, "rb") as handle:
                    return handle.read()
            return path.read_bytes()
        except (OSError, EOFError, gzip.BadGzipFile):
            return None

    def _nifti_slice_svg(
        self,
        *,
        payload: bytes,
        data_offset: int,
        endian: str,
        format_code: str,
        bytes_per_voxel: int,
        width: int,
        height: int,
        slice_index: int,
    ) -> bytes:
        x_step = max(1, math.ceil(width / NIFTI_PREVIEW_MAX_DIMENSION))
        y_step = max(1, math.ceil(height / NIFTI_PREVIEW_MAX_DIMENSION))
        values: list[list[float]] = []
        flat_values: list[float] = []
        row_stride = width
        slice_offset = slice_index * width * height
        unpack_format = f"{endian}{format_code}"

        for y in range(0, height, y_step):
            row: list[float] = []
            for x in range(0, width, x_step):
                voxel_index = slice_offset + (y * row_stride) + x
                byte_index = data_offset + (voxel_index * bytes_per_voxel)
                if byte_index + bytes_per_voxel > len(payload):
                    raise HTTPException(status_code=422, detail="NIFTI voxel data is incomplete.")
                try:
                    value = float(struct.unpack_from(unpack_format, payload, byte_index)[0])
                except struct.error as exc:
                    raise HTTPException(status_code=422, detail="NIFTI voxel data is incomplete.") from exc
                if not math.isfinite(value):
                    value = 0.0
                row.append(value)
                flat_values.append(value)
            values.append(row)

        if not values or not values[0] or not flat_values:
            raise HTTPException(status_code=422, detail="NIFTI dimensions are not previewable.")

        minimum = min(flat_values)
        maximum = max(flat_values)
        span = maximum - minimum
        rects: list[str] = []
        for y, row in enumerate(values):
            for x, value in enumerate(row):
                shade = 128 if span <= 0 else round(((value - minimum) / span) * 255)
                shade = max(0, min(255, int(shade)))
                fill = f"#{shade:02x}{shade:02x}{shade:02x}"
                rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{fill}"/>')

        sample_width = len(values[0])
        sample_height = len(values)
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {sample_width} {sample_height}" '
            'shape-rendering="crispEdges" preserveAspectRatio="none">'
            '<title>NIFTI central slice preview</title>'
            '<rect width="100%" height="100%" fill="#000000"/>'
            f'{"".join(rects)}</svg>'
        )
        return svg.encode("utf-8")

    def _stored_file_path(self, file_entry: dict) -> Path | None:
        raw_path = str(file_entry.get("storedPath") or "")
        if not raw_path:
            return None
        try:
            storage_root = Path(self._settings.local_imaging_storage_dir).resolve()
            resolved_path = Path(raw_path).resolve()
        except OSError:
            return None
        if resolved_path != storage_root and storage_root not in resolved_path.parents:
            return None
        return resolved_path if resolved_path.is_file() else None

    def _require_instance(
        self,
        study_instance_uid: str,
        series_instance_uid: str,
        sop_instance_uid: str,
    ) -> LocalDicomInstance:
        instances = self.list_dicom_instances(
            study_instance_uid=study_instance_uid,
            series_instance_uid=series_instance_uid,
            sop_instance_uid=sop_instance_uid,
        )
        if not instances:
            raise HTTPException(status_code=404, detail="Local DICOM instance was not found.")
        instance = instances[0]
        if not Path(instance.stored_path).is_file():
            raise HTTPException(status_code=404, detail="Local DICOM object is missing from storage.")
        return instance

    def _dicom_json_for_instance(self, instance: LocalDicomInstance) -> dict:
        dataset = pydicom.dcmread(instance.stored_path, force=False)

        def bulk_data_uri(data_element) -> str:
            tag = f"{data_element.tag.group:04X}{data_element.tag.element:04X}"
            return (
                f"/dicom-web/studies/{instance.study_instance_uid}"
                f"/series/{instance.series_instance_uid}"
                f"/instances/{instance.sop_instance_uid}/bulkdata/{tag}"
            )

        metadata = dataset.to_json_dict(
            bulk_data_threshold=1,
            bulk_data_element_handler=bulk_data_uri,
            suppress_invalid_tags=True,
        )
        transfer_syntax = getattr(getattr(dataset, "file_meta", None), "TransferSyntaxUID", None)
        if transfer_syntax:
            metadata["00020010"] = {"vr": "UI", "Value": [str(transfer_syntax)]}
        metadata["00081190"] = {
            "vr": "UR",
            "Value": [
                f"/dicom-web/studies/{instance.study_instance_uid}"
                f"/series/{instance.series_instance_uid}"
                f"/instances/{instance.sop_instance_uid}"
            ],
        }
        return metadata

    @staticmethod
    def _dicomdir_referenced_paths(dataset) -> list[str]:
        records = getattr(dataset, "DirectoryRecordSequence", []) or []
        referenced: list[str] = []
        for record in records:
            value = getattr(record, "ReferencedFileID", None)
            if value is None:
                continue
            if isinstance(value, str):
                referenced.append(value.replace("\\", "/"))
            else:
                referenced.append("/".join(str(part) for part in value))
        return referenced

    @staticmethod
    def _asset_id(manifest: dict, file_entry_index: int) -> str:
        import_id = str(manifest.get("importId") or "")
        return f"{import_id}.{file_entry_index}"

    @staticmethod
    def _parse_asset_id(asset_id: str) -> tuple[str, int] | None:
        import_id, separator, index_text = str(asset_id or "").rpartition(".")
        if separator != "." or not import_id.startswith("import-") or not index_text.isdigit():
            return None
        return import_id, int(index_text)

    @staticmethod
    def _preview_supported(file_format: str) -> bool:
        return file_format == "nifti" or file_format in PREVIEW_IMAGE_MEDIA_TYPES

    @staticmethod
    def _read_dicom_metadata(data: bytes, *, force: bool = False):
        if len(data) >= 132 and data[128:132] == b"DICM":
            force = False
        elif not force:
            return None

        try:
            return pydicom.dcmread(BytesIO(data), stop_before_pixels=True, force=force)
        except Exception:
            return None

    @staticmethod
    def _parse_nifti_header(header: bytes) -> dict[str, object] | None:
        if len(header) < 348 or header[344:348] not in {b"n+1\x00", b"ni1\x00"}:
            return None

        endian: str | None = None
        for candidate in ("<", ">"):
            try:
                if struct.unpack(f"{candidate}i", header[0:4])[0] == 348:
                    endian = candidate
                    break
            except struct.error:
                return None
        if endian is None:
            return None

        try:
            dims = struct.unpack(f"{endian}8h", header[40:56])
            datatype_code = struct.unpack(f"{endian}h", header[70:72])[0]
            bits_per_voxel = struct.unpack(f"{endian}h", header[72:74])[0]
            vox_offset = struct.unpack(f"{endian}f", header[108:112])[0]
        except struct.error:
            return None

        dimension_count = dims[0] if 0 < dims[0] <= 7 else 0
        dimensions = [int(value) for value in dims[1 : dimension_count + 1] if value > 0]
        return {
            "dimensions": dimensions,
            "datatypeCode": int(datatype_code),
            "bitsPerVoxel": int(bits_per_voxel),
            "voxOffset": float(vox_offset),
            "endian": endian,
            "magic": header[344:347].decode("ascii", errors="ignore"),
        }

    @staticmethod
    def _is_nifti(data: bytes, lower_name: str) -> bool:
        if lower_name.endswith(".nii") or lower_name.endswith(".nii.gz"):
            return True

        header = data[:352]
        if lower_name.endswith(".gz"):
            try:
                header = gzip.decompress(data[:4096])[:352]
            except Exception:
                return False

        if len(header) < 348:
            return False
        return header[344:348] in {b"n+1\x00", b"ni1\x00"}

    @staticmethod
    def _extension(lower_name: str) -> str:
        if lower_name.endswith(".nii.gz"):
            return "nii.gz"
        return lower_name.rsplit(".", 1)[-1] if "." in lower_name else ""

    @staticmethod
    def _safe_relative_path(value: str) -> str:
        raw = str(value or "").replace("\\", "/").strip()
        parts = [
            part
            for part in PurePosixPath(raw).parts
            if part not in {"", ".", ".."} and not part.endswith(":")
        ]
        return "/".join(parts) or "upload"

    @staticmethod
    def _safe_filename(value: str) -> str:
        cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
        return cleaned[:120] or "upload"

    @staticmethod
    def _clean_uid(value) -> str | None:
        text = str(value or "").strip()
        if not text:
            return None
        return text if re.fullmatch(r"[0-9.]+", text) else None

    @staticmethod
    def _safe_modality(value) -> str | None:
        text = str(value or "").strip().upper()
        if not text:
            return None
        return re.sub(r"[^A-Z0-9_ -]+", "", text)[:32] or None

    @staticmethod
    def _generated_uid() -> str:
        return f"2.25.{uuid4().int}"

    @staticmethod
    def _study_modality(files: list[_DetectedFile]) -> str:
        modalities = [file.modality for file in files if file.modality]
        if modalities:
            return modalities[0]
        formats = {file.format for file in files}
        if "dicomdir" in formats or "dicom" in formats:
            return "DICOM"
        if "nifti" in formats:
            return "NIFTI"
        return "IMG"

    @staticmethod
    def _study_description(formats: list[str], file_count: int) -> str:
        if formats == ["dicom"]:
            label = "DICOM"
        elif "dicomdir" in formats:
            label = "DICOMDIR"
        elif "nifti" in formats:
            label = "NIFTI"
        else:
            label = "image"
        return f"Local {label} import ({file_count} file{'s' if file_count != 1 else ''})"

    @staticmethod
    def _study_warnings(files: list[_DetectedFile], warnings: list[str]) -> list[str]:
        if any(file.format == "dicomdir" for file in files):
            return [warning for warning in warnings if "DICOMDIR" in warning]
        return []

    @staticmethod
    def _study_summary(formats: list[str], assets: list[LocalImagingStudyAsset]) -> str:
        format_set = set(formats)
        has_viewable_dicom = any(asset.viewer_supported for asset in assets)
        has_preview = any(asset.preview_supported for asset in assets)
        if has_viewable_dicom:
            return "Local DICOM assets are available through the desktop DICOMweb bridge."
        if "nifti" in format_set:
            if has_preview:
                return "Local NIFTI assets are previewable and registered for backend-side analysis summary."
            return "Local NIFTI assets are registered for backend-side analysis summary."
        if format_set.intersection(COMMON_IMAGE_EXTENSIONS):
            if has_preview:
                return "Local image assets are previewable and registered for backend-side analysis summary."
            return "Local image assets are registered for backend-side analysis summary."
        return "Local imaging assets are registered in private storage."

    @staticmethod
    def _human_size(size_bytes: int) -> str:
        value = float(max(size_bytes, 0))
        for unit in ("B", "KB", "MB", "GB"):
            if value < 1024 or unit == "GB":
                return f"{value:.1f} {unit}" if unit != "B" else f"{int(value)} B"
            value /= 1024
        return f"{value:.1f} GB"

    @staticmethod
    def _uncompressed_frame_size(dataset) -> int | None:
        try:
            rows = int(dataset.Rows)
            columns = int(dataset.Columns)
            samples_per_pixel = int(getattr(dataset, "SamplesPerPixel", 1))
            bits_allocated = int(dataset.BitsAllocated)
        except Exception:
            return None

        bytes_per_sample = max(bits_allocated // 8, 1)
        return rows * columns * samples_per_pixel * bytes_per_sample
