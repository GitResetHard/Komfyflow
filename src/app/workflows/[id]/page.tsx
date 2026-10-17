"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronRight,
  Code2,
  Copy,
  FolderPlus,
  GitBranch,
  Heart,
  Info,
  Layers3,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import WorkflowViewer from "@/components/workflow-viewer";
import { api, EmptyState, usePlatform } from "@/components/platform";
import { type Workflow, type Version } from "@/components/workflow-card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
type Comment = {
  id: string;
  body: string;
  createdAt: string;
  user: { username: string; displayName?: string };
};
type Example = { id: string; url: string; caption: string; versionId?: string };
type Collection = { id: string; name: string };
type AnalysisRun = {
  id: string;
  status: string;
  progress?: number;
  stage?: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  analysis?: {
    analyzerVersion?: string;
    schemaVersion?: string;
    originalSha256?: string;
    summary?: {
      nodeCount: number;
      linkCount: number;
      modelCount: number;
      unresolvedDependencies: number;
    };
    registrySnapshots?: {
      snapshotId: string;
      retrievedAt: string;
      source: string;
      sha256: string;
    }[];
  };
};
type Model = {
  filename: string;
  nodeId?: string;
  field?: string;
  status?: string;
  evidence?: string;
};
type Dependency = {
  nodeType: string;
  packageName?: string;
  repository?: string;
  status?: string;
  evidence?: string;
};
function Status({ status }: { status: string }) {
  const bad = /fail|error/i.test(status),
    pending = /pending|process|queue/i.test(status);
  return (
    <span className={`status-pill ${bad ? "error" : pending ? "warn" : ""}`}>
      <i />
      {status.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}
export default function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, toast } = usePlatform();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [error, setError] = useState("");
  const [versionId, setVersionId] = useState("");
  const [source, setSource] = useState<unknown>(null);
  const [sourceError, setSourceError] = useState("");
  const [tab, setTab] = useState("Overview");
  const [comments, setComments] = useState<Comment[]>([]);
  const [examples, setExamples] = useState<Example[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collection, setCollection] = useState("");
  const [busy, setBusy] = useState(false);
  const [embed, setEmbed] = useState(false);
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const load = useCallback(async () => {
    try {
      const data = await api<{ workflow: Workflow }>(`/api/workflows/${id}`);
      setWorkflow(data.workflow);
      setVersionId(
        (current) => current || data.workflow.versions?.[0]?.id || "",
      );
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
    void api<{ comments: Comment[] }>(`/api/workflows/${id}/comments`)
      .then((d) => setComments(d.comments))
      .catch(() => {});
    void api<{ examples: Example[] }>(`/api/workflows/${id}/examples`)
      .then((d) => setExamples(d.examples))
      .catch(() => {});
  }, [id, load]);
  useEffect(() => {
    if (user)
      void api<{ collections: Collection[] }>("/api/collections")
        .then((d) => setCollections(d.collections))
        .catch(() => {});
  }, [user]);
  const version =
    workflow?.versions?.find((v) => v.id === versionId) ||
    workflow?.versions?.[0];
  useEffect(() => {
    if (!versionId) return;
    let live = true;
    setSource(null);
    setSourceError("");
    api<unknown>(`/api/workflows/${id}/source?version=${versionId}`)
      .then((data) => {
        if (live) setSource(data);
      })
      .catch((err) => {
        if (live) setSourceError(err.message);
      });
    return () => {
      live = false;
    };
  }, [id, versionId, version?.status]);
  useEffect(() => {
    if (
      !workflow?.versions?.some((v) => /pending|process|queue/i.test(v.status))
    )
      return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [workflow, load]);
  useEffect(() => {
    if (!versionId) return;
    setRuns([]);
    let live = true;
    const fetchRuns = () => {
      void api<{ runs: AnalysisRun[] }>(
        `/api/workflows/${id}/runs?version=${versionId}`,
      )
        .then((data) => {
          if (live) setRuns(data.runs || []);
        })
        .catch(() => {});
    };
    fetchRuns();
    const timer = /pending|process|queue/i.test(version?.status || "")
      ? setInterval(fetchRuns, 2000)
      : null;
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
  }, [id, versionId, version?.status]);
  async function toggle(kind: "like" | "bookmark") {
    try {
      const result = await api<{ active: boolean }>(
        `/api/workflows/${id}/${kind}`,
        { method: "POST" },
      );
      setWorkflow((w) =>
        w
          ? {
              ...w,
              [kind === "like" ? "liked" : "bookmarked"]: result.active,
              _count:
                kind === "like"
                  ? {
                      likes: (w._count?.likes || 0) + (result.active ? 1 : -1),
                      comments: w._count?.comments || 0,
                    }
                  : w._count,
            }
          : w,
      );
      if (kind === "bookmark")
        toast(
          result.active
            ? "Saved to your library."
            : "Removed from saved workflows.",
        );
    } catch (err) {
      toast((err as Error).message);
    }
  }
  async function addComment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      await api(`/api/workflows/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: new FormData(form).get("body") }),
      });
      const data = await api<{ comments: Comment[] }>(
        `/api/workflows/${id}/comments`,
      );
      setComments(data.comments);
      form.reset();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(
    e: React.FormEvent<HTMLFormElement>,
    kind: "versions" | "examples",
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    if (kind === "examples") data.set("versionId", versionId);
    setBusy(true);
    try {
      await api(`/api/workflows/${id}/${kind}`, { method: "POST", body: data });
      if (kind === "versions") {
        setVersionId("");
        await load();
      } else {
        const result = await api<{ examples: Example[] }>(
          `/api/workflows/${id}/examples`,
        );
        setExamples(result.examples);
      }
      form.reset();
      toast(
        kind === "versions"
          ? "New version uploaded. Analysis is queued."
          : "Example added to the gallery.",
      );
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reanalyze() {
    setBusy(true);
    try {
      await api(`/api/workflows/${id}/reanalyze`, {
        method: "POST",
        body: JSON.stringify({ versionId }),
      });
      await load();
      toast("Analysis queued. This page will update automatically.");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addToCollection() {
    if (!collection) return;
    try {
      await api(`/api/collections/${collection}`, {
        method: "POST",
        body: JSON.stringify({ workflowId: id }),
      });
      toast("Added to collection.");
    } catch (err) {
      toast((err as Error).message);
    }
  }
  if (error)
    return (
      <div className="content-page">
        <EmptyState
          title="This workflow isn’t available"
          description={error}
          action={
            <Link href="/" className="button">
              Back to discovery
            </Link>
          }
        />
        <div className="notice">
          <Info size={17} />
          <span>
            Adult workflows are hidden unless you explicitly opt in from{" "}
            <Link href="/account" className="text-link">
              account preferences
            </Link>
            . Private workflows require their owner’s account.
          </span>
        </div>
      </div>
    );
  if (!workflow)
    return <div className="loading-page">Opening the workflow...</div>;
  const activeRun = runs.find((run) => run.status === "PENDING");
  const owner = user?.username === workflow.author.username;
  const analysis = version?.analysis || {};
  const models = Array.isArray(analysis.models)
    ? (analysis.models as Model[])
    : [];
  const dependencies = Array.isArray(analysis.dependencies)
    ? (analysis.dependencies as Dependency[])
    : [];
  const warnings = Array.isArray(analysis.warnings)
    ? (analysis.warnings as string[])
    : [];
  const nodeCount = Array.isArray(analysis.nodes)
    ? analysis.nodes.length
    : version?.nodes || 0;
  const linkCount = Array.isArray(analysis.links)
    ? analysis.links.length
    : version?.links || 0;
  const embedCode =
    typeof window === "undefined"
      ? ""
      : `<iframe src="${window.location.origin}/embed/${id}" title="${workflow.title.replaceAll('"', "&quot;")}" width="100%" height="560" loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`;
  return (
    <div className="content-page">
      <div className="breadcrumb">
        <Link href="/">Discover</Link>
        <ChevronRight size={11} />
        <Link href={`/?category=${workflow.category}`}>
          {workflow.category}
        </Link>
        <ChevronRight size={11} />
        <span>Workflow</span>
      </div>
      <div className="detail-heading">
        <div>
          <div className="tags">
            <span>{workflow.category}</span>
            {workflow.adult && <span>Adult · opt-in only</span>}
            {workflow.tags.map((tag) => (
              <Link href={`/?tag=${encodeURIComponent(tag)}`} key={tag}>
                {tag}
              </Link>
            ))}
          </div>
          <h1>{workflow.title}</h1>
          <p>{workflow.description}</p>
          <div className="detail-meta">
            <Link
              href={`/account?user=${workflow.author.username}`}
              className="card-author"
            >
              <span className="mini-avatar">
                {workflow.author.username[0].toUpperCase()}
              </span>
              {workflow.author.displayName || workflow.author.username}
            </Link>
            <span>·</span>
            <span>Version {version?.number || 1}</span>
            {version && <Status status={version.status} />}
          </div>
        </div>
        <div className="detail-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void toggle("like")}
          >
            <Heart size={14} fill={workflow.liked ? "currentColor" : "none"} />
            {workflow._count?.likes || 0}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void toggle("bookmark")}
          >
            <Bookmark
              size={14}
              fill={workflow.bookmarked ? "currentColor" : "none"}
            />
            {workflow.bookmarked ? "Saved" : "Save"}
          </Button>
          {version?.status === "READY" ? (
            <Button asChild size="sm">
              <a
                href={`/api/workflows/${id}/download?version=${versionId}`}
                download
              >
                <ArrowDownToLine size={14} /> Download original
              </a>
            </Button>
          ) : (
            <Button size="sm" disabled>
              <ArrowDownToLine size={14} /> Available after analysis
            </Button>
          )}
        </div>
      </div>
      <div className="detail-layout">
        <section className="detail-content">
          <div className="viewer-wrap">
            <div className="viewer-title">
              <span>
                <GitBranch size={14} /> Native workflow preview
              </span>
              <span>Read only · No code is executed</span>
            </div>
            {source ? (
              <WorkflowViewer workflow={source} />
            ) : (
              <div className="loading-page">
                {sourceError || "Loading the original node graph..."}
              </div>
            )}
          </div>
          <div className="detail-tabs">
            {[
              "Overview",
              "Models & nodes",
              "Examples",
              "Versions",
              "Discussion",
              ...(owner ? ["Settings"] : []),
            ].map((name) => (
              <button
                key={name}
                className={tab === name ? "active" : ""}
                onClick={() => setTab(name)}
              >
                {name}
                {name === "Discussion" && ` (${comments.length})`}
              </button>
            ))}
          </div>
          <div className="tab-content">
            {tab === "Settings" && (
              <form
                className="panel"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  setBusy(true);
                  try {
                    await api(`/api/workflows/${id}`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        title: form.get("title"),
                        description: form.get("description"),
                        category: form.get("category"),
                        visibility: form.get("visibility"),
                        adult: form.get("adult") === "on",
                        tags: String(form.get("tags") || "")
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      }),
                    });
                    await load();
                    toast("Workflow details updated.");
                  } catch (err) {
                    toast((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <h3>Workflow details</h3>
                <div className="field">
                  <label htmlFor="edit-title">Title</label>
                  <Input
                    id="edit-title"
                    name="title"
                    defaultValue={workflow.title}
                    required
                    maxLength={180}
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-description">Description</label>
                  <Textarea
                    id="edit-description"
                    name="description"
                    defaultValue={workflow.description}
                    maxLength={10000}
                  />
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="edit-category">Category</label>
                    <select
                      id="edit-category"
                      name="category"
                      defaultValue={workflow.category}
                    >
                      {[
                        "Image",
                        "Video",
                        "Upscaling",
                        "3D",
                        "Audio",
                        "Other",
                      ].map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="edit-visibility">Visibility</label>
                    <select
                      id="edit-visibility"
                      name="visibility"
                      defaultValue={workflow.visibility || "PUBLIC"}
                    >
                      <option value="PUBLIC">Public</option>
                      <option value="UNLISTED">Unlisted</option>
                      <option value="PRIVATE">Private</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="edit-tags">Tags, separated by commas</label>
                  <Input
                    id="edit-tags"
                    name="tags"
                    defaultValue={workflow.tags.join(", ")}
                  />
                </div>
                <label className="check-field">
                  <input
                    type="checkbox"
                    name="adult"
                    defaultChecked={workflow.adult}
                  />
                  <span>Contains adult content</span>
                </label>
                <Button disabled={busy} size="sm">
                  Save workflow details
                </Button>
              </form>
            )}
            {tab === "Overview" && (
              <>
                <div className="stat-grid">
                  <div className="stat-box">
                    <strong>{nodeCount}</strong>
                    <span>Connected nodes</span>
                  </div>
                  <div className="stat-box">
                    <strong>{linkCount}</strong>
                    <span>Connections</span>
                  </div>
                  <div className="stat-box">
                    <strong>{models.length}</strong>
                    <span>Model references</span>
                  </div>
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 12 }}>
                  The idea behind it
                </h2>
                <p className="prose-copy">{workflow.description}</p>
                {warnings.map((warning, i) => (
                  <div className="notice" key={i}>
                    <Info size={16} />
                    {warning}
                  </div>
                ))}
                <div className="notice">
                  <ShieldCheck size={17} />
                  <span>
                    Analysis identifies what the file references, not what is
                    installed on your machine. Model names are inferred, and
                    custom-node matches show their evidence. Inspect code before
                    installing anything.
                  </span>
                </div>
              </>
            )}
            {tab === "Models & nodes" && (
              <>
                <h3 style={{ marginBottom: 13 }}>Model references</h3>
                <div className="model-list">
                  {models.length ? (
                    models.map((model, i) => (
                      <div className="model-item" key={i}>
                        {model.filename}
                        <small>
                          Node {model.nodeId} · {model.field} ·{" "}
                          {model.status || "inferred"}
                        </small>
                        <small>{model.evidence}</small>
                      </div>
                    ))
                  ) : (
                    <p className="prose-copy">
                      No model references were detected in this version.
                    </p>
                  )}
                </div>
                <h3 style={{ margin: "25px 0 13px" }}>
                  Node packages & provenance
                </h3>
                <div className="model-list">
                  {dependencies.length ? (
                    dependencies.map((dep, i) => (
                      <div className="model-item" key={i}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <span>{dep.packageName || dep.nodeType}</span>
                          <Status status={dep.status || "unresolved"} />
                        </div>
                        <small>
                          {dep.nodeType} · {dep.evidence}
                        </small>
                        {dep.repository &&
                          /^https:\/\//.test(dep.repository) && (
                            <a
                              href={dep.repository}
                              target="_blank"
                              rel="noreferrer"
                              className="text-link"
                            >
                              Inspect package source ↗
                            </a>
                          )}
                      </div>
                    ))
                  ) : (
                    <p className="prose-copy">
                      Package details will appear once analysis completes.
                    </p>
                  )}
                </div>
              </>
            )}
            {tab === "Examples" && (
              <>
                {examples.length ? (
                  <div className="gallery">
                    {examples.map((example) => (
                      <figure key={example.id}>
                        <a href={example.url} target="_blank" rel="noreferrer">
                          <img
                            src={example.url}
                            alt={example.caption || "Workflow output example"}
                          />
                        </a>
                        <figcaption>
                          {example.caption || "Workflow example"}
                          {owner && (
                            <button
                              className="text-link"
                              style={{ float: "right" }}
                              onClick={async () => {
                                try {
                                  await api(
                                    `/api/workflows/${id}/examples?id=${example.id}`,
                                    { method: "DELETE" },
                                  );
                                  setExamples((items) =>
                                    items.filter(
                                      (item) => item.id !== example.id,
                                    ),
                                  );
                                } catch (err) {
                                  toast((err as Error).message);
                                }
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Show what’s possible"
                    description="No output examples have been shared yet."
                  />
                )}
                {owner && (
                  <form
                    className="panel"
                    style={{ marginTop: 20 }}
                    onSubmit={(e) => void upload(e, "examples")}
                  >
                    <h3>Add an output example</h3>
                    <div className="field">
                      <label htmlFor="example-file">Image</label>
                      <Input
                        id="example-file"
                        name="file"
                        type="file"
                        accept="image/png,image/webp,image/jpeg"
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="caption">Caption</label>
                      <Input
                        id="caption"
                        name="caption"
                        placeholder="What did you create?"
                      />
                    </div>
                    <Button disabled={busy} size="sm">
                      <Upload size={14} /> Add example
                    </Button>
                  </form>
                )}
              </>
            )}
            {tab === "Versions" && (
              <>
                {runs.length > 0 && (
                  <div className="analysis-history">
                    <h3>Analysis history · version {version?.number}</h3>
                    {runs.map((run) => (
                      <details className="analysis-run" key={run.id}>
                        <summary>
                          <span>
                            {new Date(run.startedAt).toLocaleString()}
                          </span>
                          <Status status={run.status} />
                          <span className="muted">
                            {run.analysis?.analyzerVersion ||
                              run.stage ||
                              "Queued"}
                          </span>
                        </summary>
                        <div className="analysis-run-content">
                          <p>
                            Engine:{" "}
                            {run.analysis?.analyzerVersion || "Awaiting report"}{" "}
                            · Schema: {run.analysis?.schemaVersion || "—"}
                          </p>
                          {run.error && (
                            <div className="error-message">{run.error}</div>
                          )}
                          {run.analysis?.summary && (
                            <p>
                              {run.analysis.summary.nodeCount} nodes ·{" "}
                              {run.analysis.summary.linkCount} connections ·{" "}
                              {run.analysis.summary.modelCount} model references
                              · {run.analysis.summary.unresolvedDependencies}{" "}
                              unresolved dependencies
                            </p>
                          )}
                          {run.analysis?.originalSha256 && (
                            <p className="hash-text">
                              Original SHA-256: {run.analysis.originalSha256}
                            </p>
                          )}
                          {run.analysis?.registrySnapshots?.map(
                            (snapshot, index) => (
                              <div className="model-item" key={index}>
                                {snapshot.snapshotId}
                                <small>
                                  Registry snapshot · {snapshot.retrievedAt}
                                </small>
                                <small>{snapshot.source}</small>
                                <small className="hash-text">
                                  SHA-256 {snapshot.sha256}
                                </small>
                              </div>
                            ),
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
                {workflow.versions?.map((v) => (
                  <div className="version-item" key={v.id}>
                    <div>
                      <strong>Version {v.number}</strong>
                      <small>
                        {v.createdAt
                          ? new Date(v.createdAt).toLocaleDateString()
                          : v.fileName || "Original workflow"}
                      </small>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <Status status={v.status} />
                      <button
                        className="text-link"
                        onClick={() => setVersionId(v.id)}
                      >
                        {v.id === versionId ? "Viewing" : "View version"}
                      </button>
                    </div>
                  </div>
                ))}
                {owner && (
                  <form
                    className="panel"
                    style={{ marginTop: 20 }}
                    onSubmit={(e) => void upload(e, "versions")}
                  >
                    <h3>Keep the idea evolving.</h3>
                    <p className="prose-copy">
                      Upload an updated workflow. Earlier versions remain
                      available.
                    </p>
                    <div className="field" style={{ marginTop: 15 }}>
                      <label htmlFor="version-file">New workflow version</label>
                      <Input
                        id="version-file"
                        name="file"
                        type="file"
                        accept=".json,.png"
                        required
                      />
                    </div>
                    <Button disabled={busy} size="sm">
                      <Upload size={14} /> Upload new version
                    </Button>
                  </form>
                )}
              </>
            )}
            {tab === "Discussion" && (
              <>
                <form onSubmit={addComment}>
                  <div className="field">
                    <label htmlFor="comment">
                      Ideas, questions, and a little appreciation.
                    </label>
                    <Textarea
                      id="comment"
                      name="body"
                      required
                      maxLength={3000}
                      placeholder={
                        user
                          ? "What did you discover?"
                          : "Sign in to join the conversation."
                      }
                      disabled={!user}
                    />
                  </div>
                  {user ? (
                    <Button disabled={busy} size="sm">
                      Post comment <MessageSquare size={13} />
                    </Button>
                  ) : (
                    <Link className="text-link" href="/auth">
                      Sign in to comment →
                    </Link>
                  )}
                </form>
                {comments.map((comment) => (
                  <article className="comment" key={comment.id}>
                    <div className="comment-head">
                      <span className="mini-avatar">
                        {comment.user.username[0].toUpperCase()}
                      </span>
                      <span>
                        {comment.user.displayName || comment.user.username}
                      </span>
                      <time>
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </time>
                    </div>
                    <p>{comment.body}</p>
                  </article>
                ))}
              </>
            )}
          </div>
        </section>
        <aside className="detail-sidebar">
          <div className="panel">
            <h3>Inside the workflow</h3>
            {version && /pending|process|queue/i.test(version.status) && (
              <div className="analysis-progress" role="status">
                <div>
                  <span>
                    {activeRun?.stage || "Queued · waiting for worker"}
                  </span>
                  <span>{activeRun?.progress ?? 0}%</span>
                </div>
                <progress
                  aria-label="Workflow analysis progress"
                  max={100}
                  value={activeRun?.progress ?? 0}
                />
                <small>
                  Live processing milestones. Updates automatically.
                </small>
              </div>
            )}
            {version?.error && (
              <div className="error-message">{version.error}</div>
            )}
            <div className="metadata-row">
              <span>Format</span>
              <span>{String(analysis.sourceKind || "ComfyUI")} JSON</span>
            </div>
            <div className="metadata-row">
              <span>Analysis</span>
              {version && <Status status={version.status} />}
            </div>
            <div className="metadata-row">
              <span>Nodes</span>
              <span>{nodeCount}</span>
            </div>
            <div className="metadata-row">
              <span>Models</span>
              <span>{models.length}</span>
            </div>
            <div className="metadata-row">
              <span>Analyzer</span>
              <span>
                {String(analysis.analyzerVersion || "Awaiting analysis")}
              </span>
            </div>
            <label className="field" style={{ marginTop: 18, marginBottom: 0 }}>
              Version
              <select
                className="version-select"
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
              >
                {workflow.versions?.map((v) => (
                  <option value={v.id} key={v.id}>
                    Version {v.number} · {v.status.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            {owner && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void reanalyze()}
                disabled={busy}
                style={{ marginTop: 13, width: "100%" }}
              >
                <RefreshCw size={13} /> Reanalyze this version
              </Button>
            )}
          </div>
          <div className="panel">
            <h3>A place for your next idea.</h3>
            <p>Keep useful workflows together in a collection.</p>
            {user ? (
              <>
                <select
                  className="version-select"
                  style={{ marginTop: 14 }}
                  value={collection}
                  onChange={(e) => setCollection(e.target.value)}
                >
                  <option value="">Choose a collection</option>
                  {collections.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  style={{ width: "100%", marginTop: 9 }}
                  disabled={!collection}
                  onClick={() => void addToCollection()}
                >
                  <FolderPlus size={14} /> Add to collection
                </Button>
                <Link
                  href="/collections"
                  className="text-link"
                  style={{ display: "block", marginTop: 11 }}
                >
                  Create a collection →
                </Link>
              </>
            ) : (
              <Link
                href="/auth"
                className="text-link"
                style={{ display: "block", marginTop: 12 }}
              >
                Sign in to collect →
              </Link>
            )}
          </div>
          <div className="panel">
            <h3>Pass the inspiration on.</h3>
            <div
              className="form-actions"
              style={{ flexWrap: "wrap", marginTop: 12 }}
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(location.href);
                    toast("Workflow link copied.");
                  } catch {
                    toast("Copy the link from your address bar.");
                  }
                }}
              >
                <Copy size={13} /> Copy link
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEmbed(!embed)}
              >
                <Code2 size={13} /> Embed
              </Button>
            </div>
            {embed && (
              <>
                <p style={{ margin: "13px 0 8px" }}>
                  Public workflows can be embedded. Private and adult access
                  controls still apply.
                </p>
                <textarea
                  className="embed-code"
                  readOnly
                  value={embedCode}
                  aria-label="Workflow embed code"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ marginTop: 8 }}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(embedCode);
                      toast("Embed code copied.");
                    } catch {
                      toast("Select the embed code and copy it.");
                    }
                  }}
                >
                  Copy embed
                </Button>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
