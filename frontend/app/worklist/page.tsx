"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, FileSearch, FolderOpen, Loader2, ShieldCheck, Stethoscope, Upload, X } from "lucide-react";

import { clinicalApi, resolveClinicalApiUrl } from "@/lib/clinical/client";
import type {
  ClinicalPlatformConfig,
  LocalImagingStudyAnalysisResponse,
  LocalImagingStudyAssetsResponse,
  SessionClaims,
  WorklistRow,
} from "@/lib/clinical/contracts";

type DesktopPickedFile = {
  data: ArrayBuffer | ArrayBufferView;
  lastModified?: number;
  name: string;
  relativePath: string;
  size: number;
  type?: string;
};

type DesktopPickerMode = "files" | "folder";

declare global {
  interface Window {
    radsysxDesktop?: {
      selectLocalImagingFiles?: (options?: { mode?: DesktopPickerMode }) => Promise<{
        cancelled: boolean;
        files: DesktopPickedFile[];
      }>;
      versions?: {
        chrome?: string;
        electron?: string;
        node?: string;
      };
    };
  }
}

export default function WorklistPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [config, setConfig] = useState<ClinicalPlatformConfig | null>(null);
  const [session, setSession] = useState<SessionClaims | null>(null);
  const [rows, setRows] = useState<WorklistRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [launchingStudyUid, setLaunchingStudyUid] = useState<string | null>(null);
  const [inspectingStudyUid, setInspectingStudyUid] = useState<string | null>(null);
  const [analyzingStudyUid, setAnalyzingStudyUid] = useState<string | null>(null);
  const [localStudyAssets, setLocalStudyAssets] = useState<LocalImagingStudyAssetsResponse | null>(null);
  const [localStudyAnalysis, setLocalStudyAnalysis] = useState<LocalImagingStudyAnalysisResponse | null>(null);

  const directoryInputProps = {
    directory: "",
    webkitdirectory: "",
  } as Record<string, string>;

  const loadClinicalWorkspace = useCallback(async (cancelled?: () => boolean) => {
    try {
      const sessionResponse = await clinicalApi.getSession();
      if (!sessionResponse.authenticated || !sessionResponse.session) {
        router.replace("/login?next=%2Fworklist");
        return;
      }

      const [platformConfig, worklist] = await Promise.all([
        clinicalApi.getPlatformConfig(),
        clinicalApi.getWorklist(),
      ]);

      if (cancelled?.()) {
        return;
      }

      setSession(sessionResponse.session);
      setConfig(platformConfig);
      setRows(worklist.rows);
    } catch (cause) {
      if (!cancelled?.()) {
        setError(cause instanceof Error ? cause.message : "Failed to load clinical worklist.");
      }
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    void loadClinicalWorkspace(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadClinicalWorkspace]);

  const headline = useMemo(() => {
    if (!config) {
      return "Loading clinical platform posture...";
    }
    return `Clinical worklist in ${config.mode} mode`;
  }, [config]);

  const handleOpenViewer = async (row: WorklistRow) => {
    setLaunchingStudyUid(row.studyInstanceUID);
    try {
      const launch = await clinicalApi.launchImaging({
        studyInstanceUID: row.studyInstanceUID,
      });
      window.location.assign(launch.viewerUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to launch viewer.");
    } finally {
      setLaunchingStudyUid(null);
    }
  };

  const handleInspectLocalStudy = async (row: WorklistRow) => {
    setInspectingStudyUid(row.studyInstanceUID);
    setError(null);
    setLocalStudyAnalysis(null);
    try {
      const assets = await clinicalApi.getLocalImagingStudyAssets(row.studyInstanceUID);
      setLocalStudyAssets(assets);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to inspect local imaging files.");
    } finally {
      setInspectingStudyUid(null);
    }
  };

  const handleAnalyzeLocalStudy = async (studyInstanceUID: string) => {
    setAnalyzingStudyUid(studyInstanceUID);
    setError(null);
    try {
      const analysis = await clinicalApi.getLocalImagingStudyAnalysis(studyInstanceUID);
      setLocalStudyAnalysis(analysis);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to analyze local imaging files.");
    } finally {
      setAnalyzingStudyUid(null);
    }
  };

  const importLocalFiles = async (files: File[]) => {
    if (!files.length) {
      return;
    }

    setImporting(true);
    setError(null);
    setImportMessage(null);
    setImportWarnings([]);
    setLocalStudyAssets(null);
    setLocalStudyAnalysis(null);

    try {
      const response = await clinicalApi.importLocalImaging(files);
      const studyCount = response.importedStudies.length;
      setImportMessage(
        `Imported ${response.acceptedFiles} file${response.acceptedFiles === 1 ? "" : "s"} into ${studyCount} local stud${studyCount === 1 ? "y" : "ies"}.`,
      );
      setImportWarnings(response.warnings);
      const worklist = await clinicalApi.getWorklist();
      setRows(worklist.rows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to import local imaging files.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (folderInputRef.current) {
        folderInputRef.current.value = "";
      }
    }
  };

  const handleLocalImport = async (fileList: FileList | null) => {
    await importLocalFiles(Array.from(fileList ?? []));
  };

  const handleDesktopLocalImport = async (mode: DesktopPickerMode) => {
    const picker = window.radsysxDesktop?.selectLocalImagingFiles;
    if (!picker) {
      if (mode === "folder") {
        folderInputRef.current?.click();
      } else {
        fileInputRef.current?.click();
      }
      return;
    }

    setError(null);
    try {
      const result = await picker({ mode });
      if (result.cancelled) {
        return;
      }
      await importLocalFiles(result.files.map(desktopPickedFileToFile));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to choose local imaging files.");
    }
  };

  const handleLogout = async () => {
    try {
      await clinicalApi.logout();
      router.replace("/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to end clinical session.");
    }
  };

  return (
    <div className="min-h-screen overflow-y-auto bg-[#0b1220] text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="rounded-3xl border border-cyan-400/30 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_42%),linear-gradient(180deg,_rgba(15,23,42,0.96),_rgba(2,6,23,0.98))] p-8 shadow-2xl shadow-cyan-950/30">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-cyan-300/80">
                <ShieldCheck className="h-4 w-4" />
                RadSysX Clinical Workspace
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">{headline}</h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300">
                The worklist is now backed by the FastAPI clinical surface. Study launch is
                opaque and signed, triage remains shadow-first unless governance enables higher
                modes, and the legacy upload/analyze flows are treated as research-only.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {session && (
                <div className="text-right text-sm text-slate-300">
                  <div>{session.name}</div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {session.roles.join(", ")}
                  </div>
                </div>
              )}
              <Link
                href="/"
                className="rounded-full border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400/50 hover:text-white"
              >
                Research workstation
              </Link>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-300/20"
              >
                Sign out
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {config?.localImagingEnabled && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div>
                <div className="text-sm font-medium text-white">Local imaging import</div>
                <div className="mt-1 text-xs text-slate-400">
                  DICOM, DICOMDIR, NIFTI, PNG, JPEG, TIFF
                </div>
                {importMessage && (
                  <div className="mt-2 text-sm text-cyan-100">{importMessage}</div>
                )}
                {importWarnings.length > 0 && (
                  <div className="mt-2 text-xs text-amber-200">
                    {importWarnings.join(" ")}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".dcm,.dicom,.nii,.nii.gz,.png,.jpg,.jpeg,.tif,.tiff,DICOMDIR"
                  className="hidden"
                  onChange={(event) => void handleLocalImport(event.currentTarget.files)}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => void handleLocalImport(event.currentTarget.files)}
                  {...directoryInputProps}
                />
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => void handleDesktopLocalImport("files")}
                  className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-wait disabled:opacity-70"
                >
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Import files
                </button>
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => void handleDesktopLocalImport("folder")}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400/50 hover:text-white disabled:cursor-wait disabled:opacity-70"
                >
                  <FolderOpen className="h-4 w-4" />
                  Import folder
                </button>
              </div>
            </div>
          )}

          {localStudyAssets && (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-cyan-300/70">
                    <FileSearch className="h-4 w-4" />
                    Local study assets
                  </div>
                  <div className="mt-2 text-base font-medium text-white">
                    {localStudyAssets.description}
                  </div>
                  <div className="mt-1 text-sm text-slate-300">{localStudyAssets.summary}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAnalyzeLocalStudy(localStudyAssets.studyInstanceUID)}
                    className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-wait disabled:opacity-70"
                    disabled={analyzingStudyUid === localStudyAssets.studyInstanceUID}
                  >
                    {analyzingStudyUid === localStudyAssets.studyInstanceUID ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Activity className="h-4 w-4" />
                    )}
                    Analyze
                  </button>
                  <button
                    type="button"
                    aria-label="Close local study assets"
                    onClick={() => {
                      setLocalStudyAssets(null);
                      setLocalStudyAnalysis(null);
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900/70 text-slate-300 transition hover:border-cyan-400/50 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {localStudyAssets.warnings.length > 0 && (
                <div className="mt-3 text-xs text-amber-200">
                  {localStudyAssets.warnings.join(" ")}
                </div>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {localStudyAssets.findings.map((finding) => (
                  <div
                    key={`${finding.label}-${finding.value}`}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2"
                  >
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      {finding.label}
                    </div>
                    <div className="mt-1 break-words text-sm text-slate-100">{finding.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
                {localStudyAssets.assets.map((asset) => (
                  <div
                    key={asset.assetId}
                    className="grid gap-3 bg-slate-950/40 px-3 py-3 text-sm text-slate-300 md:grid-cols-[104px_minmax(0,1fr)_92px_92px]"
                  >
                    <div className="flex h-20 w-24 items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-900/80">
                      {asset.previewSupported && asset.previewUrl ? (
                        <img
                          src={resolveClinicalApiUrl(asset.previewUrl)}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="px-2 text-center text-xs uppercase tracking-[0.14em] text-cyan-300/70">
                          {asset.format}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 self-center">
                      <div className="text-xs uppercase tracking-[0.14em] text-cyan-300/70">
                        {asset.format}
                      </div>
                      <div className="mt-1 break-all text-slate-100">{asset.relativePath}</div>
                    </div>
                    <div className="self-center">{formatFileSize(asset.size)}</div>
                    <div className="self-center">
                      {asset.viewerSupported ? "Viewer" : asset.analysisSupported ? "Analysis" : "Stored"}
                    </div>
                  </div>
                ))}
              </div>

              {localStudyAnalysis && (
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-cyan-300/70">
                      <Activity className="h-4 w-4" />
                      Local analysis
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(localStudyAnalysis.analyzedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-slate-300">{localStudyAnalysis.summary}</div>
                  {localStudyAnalysis.warnings.length > 0 && (
                    <div className="mt-2 text-xs text-amber-200">
                      {localStudyAnalysis.warnings.join(" ")}
                    </div>
                  )}
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {localStudyAnalysis.analyses.map((analysis) => (
                      <div
                        key={analysis.assetId}
                        className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
                      >
                        <div className="text-xs uppercase tracking-[0.14em] text-cyan-300/70">
                          {analysis.format}
                        </div>
                        <div className="mt-1 break-all text-sm font-medium text-white">
                          {analysis.relativePath}
                        </div>
                        <div className="mt-1 text-sm text-slate-300">{analysis.summary}</div>
                        {analysis.warnings.length > 0 && (
                          <div className="mt-2 text-xs text-amber-200">
                            {analysis.warnings.join(" ")}
                          </div>
                        )}
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {analysis.metrics.map((metric) => (
                            <div
                              key={`${analysis.assetId}-${metric.label}-${metric.value}`}
                              className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2"
                            >
                              <div className="text-xs uppercase tracking-[0.12em] text-slate-500">
                                {metric.label}
                              </div>
                              <div className="mt-1 break-words text-sm text-slate-100">
                                {metric.value}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 grid gap-4">
            {rows.map((row) => (
              <div
                key={row.studyInstanceUID}
                className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-5 lg:grid-cols-[1.7fr_1fr_auto]"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-cyan-300/70">
                    <Stethoscope className="h-4 w-4" />
                    {row.modality} study
                  </div>
                  <div className="mt-2 text-lg font-medium text-white">{row.description}</div>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-300">
                    <span>Accession {row.accessionNumber}</span>
                    <span>Patient {row.patientRef}</span>
                    <span>Status {row.status}</span>
                  </div>
                  <div className="mt-3 text-xs text-slate-400">
                    Study UID {row.studyInstanceUID}
                  </div>
                </div>

                <div className="space-y-2 text-sm text-slate-300">
                  <div>Priors {row.priorStudyUIDs.length}</div>
                  <div>
                    Triage score{" "}
                    {row.triageScore == null ? "Unavailable" : row.triageScore.toFixed(2)}
                  </div>
                  <div>Archive {row.archiveRef}</div>
                  <div>Updated {new Date(row.lastUpdatedAt).toLocaleString()}</div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 lg:flex-col lg:items-stretch">
                  {row.archiveRef.startsWith("local://") && (
                    <button
                      type="button"
                      onClick={() => void handleInspectLocalStudy(row)}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-wait disabled:opacity-70"
                      disabled={inspectingStudyUid === row.studyInstanceUID}
                    >
                      {inspectingStudyUid === row.studyInstanceUID ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileSearch className="h-4 w-4" />
                      )}
                      Inspect files
                    </button>
                  )}
                  {(!row.archiveRef.startsWith("local://") ||
                    !["NIFTI", "IMG"].includes(row.modality.toUpperCase())) && (
                    <button
                      type="button"
                      onClick={() => void handleOpenViewer(row)}
                      className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70"
                      disabled={launchingStudyUid === row.studyInstanceUID}
                    >
                      {launchingStudyUid === row.studyInstanceUID ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Launching
                        </span>
                      ) : (
                        "Open viewer"
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatFileSize(sizeBytes: number): string {
  let value = Math.max(sizeBytes, 0);
  for (const unit of ["B", "KB", "MB", "GB"]) {
    if (value < 1024 || unit === "GB") {
      return unit === "B" ? `${Math.round(value)} B` : `${value.toFixed(1)} ${unit}`;
    }
    value /= 1024;
  }
  return `${value.toFixed(1)} GB`;
}

function desktopPickedFileToFile(part: DesktopPickedFile): File {
  const file = new File([toBlobPart(part.data)], part.name, {
    lastModified: part.lastModified,
    type: part.type || "application/octet-stream",
  }) as File & { radsysxRelativePath?: string };
  Object.defineProperty(file, "radsysxRelativePath", {
    configurable: true,
    value: part.relativePath || part.name,
  });
  return file;
}

function toBlobPart(data: ArrayBuffer | ArrayBufferView): BlobPart {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  const source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy.buffer;
}
