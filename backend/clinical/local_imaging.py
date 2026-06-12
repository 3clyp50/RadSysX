from __future__ import annotations

import gzip
import json
import re
import shutil
from collections import defaultdict
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path, PurePosixPath
from uuid import uuid4

import pydicom

from .config import ClinicalPlatformSettings
from .contracts import LocalImagingImportResponse, LocalImagingImportedStudy
from .repositories import ClinicalRepository

DICOMDIR_SOP_CLASS_UID = "1.2.840.10008.1.3.10"
COMMON_IMAGE_EXTENSIONS = {"bmp", "gif", "jpg", "jpeg", "png", "tif", "tiff"}


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
            studies = self._register_studies(import_id, detected_files, warnings)
            self._write_manifest(import_root, import_id, detected_files, studies, warnings)
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
    ) -> list[LocalImagingImportedStudy]:
        if not detected_files:
            return []

        grouped: dict[str, list[_DetectedFile]] = defaultdict(list)
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

        return studies

    def _write_manifest(
        self,
        import_root: Path,
        import_id: str,
        detected_files: list[_DetectedFile],
        studies: list[LocalImagingImportedStudy],
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
                    "seriesInstanceUID": file.series_instance_uid,
                    "sopInstanceUID": file.sop_instance_uid,
                    "modality": file.modality,
                }
                for file in detected_files
            ],
            "warnings": warnings,
        }
        (import_root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

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
