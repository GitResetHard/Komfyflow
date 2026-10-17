"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  GitBranch,
  Heart,
  Layers3,
} from "lucide-react";
import { api, usePlatform } from "./platform";
import { useRef, useState } from "react";
export type Workflow = {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  adult: boolean;
  visibility?: string;
  thumbnailUrl?: string | null;
  createdAt?: string;
  author: { username: string; displayName?: string; avatarUrl?: string };
  _count?: { likes: number; comments: number };
  versions?: Version[];
  liked?: boolean;
  bookmarked?: boolean;
  examples?: {
    id: string;
    url?: string;
    imageUrl?: string;
    caption?: string;
  }[];
};
export type Version = {
  id: string;
  number: number;
  status: string;
  nodes?: number;
  links?: number;
  error?: string;
  sha256?: string;
  originalName?: string;
  analysis?: Record<string, unknown> | null;
  createdAt?: string;
  fileName?: string;
};
const art = [
  "landscape",
  "portrait",
  "architecture",
  "abstract",
  "stilllife",
  "motion",
];
export function WorkflowCard({
  workflow,
  index = 0,
}: {
  workflow: Workflow;
  index?: number;
}) {
  const { toast } = usePlatform();
  const pending = useRef(new Set<string>());
  const [saved, setSaved] = useState(!!workflow.bookmarked);
  const [liked, setLiked] = useState(!!workflow.liked);
  const [likes, setLikes] = useState(workflow._count?.likes || 0);
  async function toggle(type: "like" | "bookmark") {
    if (pending.current.has(type)) return;
    pending.current.add(type);
    try {
      const result = await api<{ active: boolean }>(
        `/api/workflows/${workflow.id}/${type}`,
        { method: "POST" },
      );
      if (type === "bookmark") {
        setSaved(result.active);
        toast(
          result.active
            ? "Saved to your library."
            : "Removed from saved workflows.",
        );
      } else {
        setLiked(result.active);
        setLikes((n) => n + (result.active ? 1 : -1));
      }
    } catch (error) {
      toast((error as Error).message);
    } finally {
      pending.current.delete(type);
    }
  }
  return (
    <article className="workflow-card">
      <div className="card-art">
        <Link
          href={`/workflows/${workflow.id}`}
          tabIndex={-1}
          aria-hidden="true"
        >
          <img
            src={workflow.thumbnailUrl || `/art/${art[index % art.length]}.svg`}
            alt="Workflow illustration"
            loading="lazy"
          />
        </Link>
        <span className="art-badge">
          <span />
          {workflow.category}
        </span>
        {workflow.title.toLowerCase().includes("sample") && (
          <span className="sample-badge">SAMPLE</span>
        )}
        <button
          className={`card-save ${saved ? "is-saved" : ""}`}
          onClick={() => void toggle("bookmark")}
          aria-label={saved ? "Unsave workflow" : "Save workflow"}
        >
          <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
        </button>
        <Link
          href={`/workflows/${workflow.id}`}
          className="art-open"
          aria-label={`Explore ${workflow.title}`}
        >
          <ArrowUpRight size={19} />
        </Link>
      </div>
      <div className="card-body">
        <div className="card-title-row">
          <Link href={`/workflows/${workflow.id}`}>
            <h3>{workflow.title}</h3>
          </Link>
          <span className="version-badge">
            v{workflow.versions?.[0]?.number || 1}
          </span>
        </div>
        <p className="card-description">{workflow.description}</p>
        <div className="tags">
          {workflow.tags.slice(0, 3).map((tag) => (
            <Link href={`/?tag=${encodeURIComponent(tag)}`} key={tag}>
              {tag}
            </Link>
          ))}
        </div>
        <div className="card-footer">
          <Link
            className="card-author"
            href={`/account?user=${workflow.author.username}`}
          >
            <span className={`mini-avatar avatar-${index % 4}`}>
              {(workflow.author.displayName || workflow.author.username)
                .slice(0, 1)
                .toUpperCase()}
            </span>
            {workflow.author.username}
          </Link>
          <div className="card-stats">
            <span title="Nodes">
              <GitBranch size={13} />
              {workflow.versions?.[0]?.nodes ?? "—"}
            </span>
            <button
              onClick={() => void toggle("like")}
              className={liked ? "liked" : ""}
              aria-label={liked ? "Unlike workflow" : "Like workflow"}
            >
              <Heart size={13} fill={liked ? "currentColor" : "none"} />
              {likes}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
