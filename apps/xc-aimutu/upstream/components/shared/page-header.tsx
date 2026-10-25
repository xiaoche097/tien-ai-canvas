export function PageHeader(props: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="motu-page-header flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        {props.eyebrow ? (
          <p className="text-xs text-muted-foreground">{props.eyebrow}</p>
        ) : null}
        <div className="space-y-1">
          <h1 className="break-words text-2xl font-semibold leading-snug tracking-tight text-foreground">{props.title}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{props.description}</p>
        </div>
      </div>
      {props.actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{props.actions}</div> : null}
    </div>
  );
}
