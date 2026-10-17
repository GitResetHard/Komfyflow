"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import WorkflowViewer from "@/components/workflow-viewer";
import { api } from "@/components/platform";
export default function Embed({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [source, setSource] = useState<unknown>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/api/workflows/${id}/source`)
      .then(setSource)
      .catch((err) => setError(err.message));
  }, [id]);
  return (
    <div className="embed-page">
      <style>{`.header,.sidebar,.main-footer{display:none!important}.main{margin-left:0!important;min-height:0!important}.embed-page{padding:10px}.embed-credit{display:flex;justify-content:space-between;padding:10px 4px;font-size:11px;color:var(--muted)}`}</style>
      {source ? (
        <WorkflowViewer workflow={source} />
      ) : (
        <p className="loading-page">{error || "Loading workflow..."}</p>
      )}
      <div className="embed-credit">
        <span>komfyflow · Read-only workflow</span>
        <Link href={`/workflows/${id}`} target="_blank">
          Open full workflow ↗
        </Link>
      </div>
    </div>
  );
}
