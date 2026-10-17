"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FolderHeart, Plus, Trash2 } from "lucide-react";
import {
  api,
  EmptyState,
  PageHeading,
  usePlatform,
} from "@/components/platform";
import { WorkflowCard, type Workflow } from "@/components/workflow-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Collection = {
  id: string;
  name: string;
  _count?: { items: number };
  items?: { workflow: Workflow }[];
};
export default function Collections() {
  const { user, toast } = usePlatform();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<Collection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (user)
      void api<{ collections: Collection[] }>("/api/collections")
        .then((d) => setCollections(d.collections))
        .catch((err) => setError(err.message));
  }, [user]);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      await api("/api/collections", {
        method: "POST",
        body: JSON.stringify({ name: new FormData(form).get("name") }),
      });
      const data = await api<{ collections: Collection[] }>("/api/collections");
      setCollections(data.collections);
      form.reset();
      toast("A new home for your ideas. Collection created.");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    try {
      const data = await api<{ collection: Collection }>(
        `/api/collections/${id}`,
      );
      setSelected(data.collection);
    } catch (err) {
      toast((err as Error).message);
    }
  }
  async function remove(workflowId?: string) {
    if (!selected) return;
    if (
      !workflowId &&
      !window.confirm(
        `Delete “${selected.name}”? The workflows themselves will not be deleted.`,
      )
    )
      return;
    try {
      await api(
        `/api/collections/${selected.id}${workflowId ? `?workflowId=${workflowId}` : ""}`,
        { method: "DELETE" },
      );
      if (workflowId) await open(selected.id);
      else {
        setCollections((c) => c.filter((item) => item.id !== selected.id));
        setSelected(null);
      }
      toast(
        workflowId
          ? "Workflow removed from collection."
          : "Collection deleted.",
      );
    } catch (err) {
      toast((err as Error).message);
    }
  }
  return (
    <div className="content-page">
      <PageHeading
        eyebrow="A PLACE FOR EVERY IDEA"
        title="Your creative shelves."
        description="Bring a few good workflows together. Keep the sparks for your next project within reach."
      />
      {!user ? (
        <EmptyState
          title="Make room for inspiration"
          description="Sign in to create personal collections and save workflows for later."
          action={
            <Link href="/auth" className="button">
              Sign in <ArrowUpRight size={14} />
            </Link>
          }
        />
      ) : (
        <>
          <form className="inline-form" onSubmit={create}>
            <Input
              name="name"
              placeholder="Name a new collection"
              aria-label="New collection name"
              maxLength={100}
              required
            />
            <Button disabled={busy}>
              <Plus size={15} /> Create collection
            </Button>
          </form>
          {error && <div className="error-message">{error}</div>}
          {collections.length ? (
            <div className="collection-grid">
              {collections.map((c) => (
                <button
                  className={`collection-card ${selected?.id === c.id ? "active" : ""}`}
                  key={c.id}
                  onClick={() => void open(c.id)}
                >
                  <FolderHeart size={28} />
                  <h3>{c.name}</h3>
                  <span>
                    {c._count?.items ?? c.items?.length ?? 0} workflows ·
                    Private collection
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="An empty shelf, endless possibilities"
              description="Create your first collection, then add workflows from their detail pages."
            />
          )}
          {selected && (
            <section className="collection-section">
              <div className="section-heading">
                <h2>{selected.name}</h2>
                <Button variant="ghost" size="sm" onClick={() => void remove()}>
                  <Trash2 size={13} /> Delete collection
                </Button>
              </div>
              {selected.items?.length ? (
                <div className="workflow-grid">
                  {selected.items.map(({ workflow }, index) => (
                    <div key={workflow.id}>
                      <WorkflowCard workflow={workflow} index={index} />
                      <button
                        className="text-link"
                        style={{ marginTop: 9 }}
                        onClick={() => void remove(workflow.id)}
                      >
                        Remove from collection
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Start gathering good ideas"
                  description="Open any workflow and choose this collection in its sidebar."
                  action={
                    <Link href="/" className="button secondary">
                      Explore workflows
                    </Link>
                  }
                />
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
