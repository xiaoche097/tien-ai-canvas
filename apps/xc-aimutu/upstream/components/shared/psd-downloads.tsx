import { motuApiUrl } from "@/lib/utils/public-url";

export function PsdDownloads({ projectId, sections }: { projectId: string; sections: any[] }) {
  const files = sections.flatMap((section) => (section.versions ?? []).flatMap((version: any) => {
    const psd = version.promptSnapshot?.psd;
    return psd?.sessionId && psd?.psdAssetId ? [{ section, version, sessionId: psd.sessionId }] : [];
  }));
  if (!files.length) return null;
  return <div className="space-y-2 rounded-xl border border-border p-3">
    <p className="text-sm font-medium">PSD 精修文件</p>
    {files.map(({ section, version, sessionId }) => <div key={version.id} className="flex flex-wrap items-center gap-2 text-xs">
      <span className="min-w-0 flex-1 break-words">{section.title} · v{version.versionNumber}</span>
      {(["psd", "png"] as const).map((format) => <a key={format} className="rounded-lg border border-border px-2 py-1 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" href={motuApiUrl(`projects/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(section.id)}/psd/${encodeURIComponent(sessionId)}/versions/${encodeURIComponent(version.id)}/${format}`)} download>{format.toUpperCase()}</a>)}
    </div>)}
  </div>;
}
