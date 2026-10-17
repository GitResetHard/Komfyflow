"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  ChevronDown,
  Grid2X2,
  Layers3,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { api, EmptyState } from "@/components/platform";
import { WorkflowCard, type Workflow } from "@/components/workflow-card";
function Discover() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [tag, setTag] = useState(params.get("tag") || "");
  const [sort, setSort] = useState("popular");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    setCategory(params.get("category") || "");
    setTag(params.get("tag") || "");
  }, [params]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setPage(1);
    const timer = setTimeout(() => {
      const search = new URLSearchParams({ q: query, category, tag, sort });
      api<{ workflows: Workflow[]; hasMore: boolean }>(
        `/api/workflows?${search}`,
      )
        .then((data) => {
          if (live) {
            setWorkflows(data.workflows);
            setHasMore(data.hasMore);
            setError("");
          }
        })
        .catch((err) => {
          if (live) setError(err.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 220);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, category, tag, sort]);
  async function loadMore() {
    setLoadingMore(true);
    try {
      const search = new URLSearchParams({
        q: query,
        category,
        tag,
        sort,
        page: String(page + 1),
      });
      const data = await api<{ workflows: Workflow[]; hasMore: boolean }>(
        `/api/workflows?${search}`,
      );
      setWorkflows((items) => [
        ...items,
        ...data.workflows.filter(
          (item) => !items.some((existing) => existing.id === item.id),
        ),
      ]);
      setHasMore(data.hasMore);
      setPage((current) => current + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }
  return (
    <div className="discover-page">
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span /> THE WORKFLOW IS THE ART.
          </div>
          <h1>
            A good workflow
            <br />
            changes <em>everything.</em>
          </h1>
          <p>
            Discover the building blocks behind great creations.
            <br className="desktop-break" /> Explore, learn, and make them your
            own.
          </p>
          <div className="hero-actions">
            <a href="#explore" className="button">
              Find your next workflow <ArrowRight size={16} />
            </a>
            <Link href="/upload" className="text-button">
              Share yours <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="hero-community">
            <div className="avatar-stack">
              <span>J</span>
              <span>A</span>
              <span>M</span>
              <span>K</span>
            </div>
            <span>
              A home for curious creators <span className="little-star">✧</span>
            </span>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-grid" />
          <div className="visual-label">
            <span className="pulse-dot" /> IDEAS, CONNECTED
          </div>
          <svg className="hero-wires" viewBox="0 0 520 380" fill="none">
            <path
              d="M100 140C210 140 130 240 285 240"
              stroke="var(--accent)"
              strokeWidth="2"
            />
            <path
              d="M155 280C220 280 190 180 340 180"
              stroke="#788e7b"
              strokeWidth="2"
            />
            <path
              d="M285 240C370 240 330 300 450 300"
              stroke="#9992ac"
              strokeWidth="2"
            />
            <path
              d="M140 140C230 140 200 80 340 80"
              stroke="#7b8fa2"
              strokeWidth="2"
            />
          </svg>
          <div className="visual-node node-prompt">
            <div className="node-header">
              <Sparkles size={12} /> Your imagination <span>•••</span>
            </div>
            <div className="node-value">a world, not yet seen_</div>
            <span className="port right" />
          </div>
          <div className="visual-node node-sampler">
            <div className="node-header">
              <Boxes size={12} /> The possibilities <span>•••</span>
            </div>
            <div className="sampler-line">
              <span>creativity</span>
              <b>unlimited</b>
            </div>
            <div className="sampler-line">
              <span>steps</span>
              <b>one more</b>
            </div>
            <span className="port left" />
            <span className="port right" />
          </div>
          <div className="visual-output">
            <img src="/art/abstract.svg" alt="" />
            <div>
              <span className="pulse-dot" /> Something entirely yours{" "}
              <ArrowUpRight size={13} />
            </div>
          </div>
          <div className="visual-caption">
            FROM A LITTLE CURIOSITY, SOMETHING GREAT.
          </div>
        </div>
      </section>
      <section id="explore" className="explore-section">
        <div className="section-top">
          <div>
            <div className="eyebrow accent-text">THE COMMUNITY TOOLKIT</div>
            <h2>
              Find your next starting point
              <span className="heading-dot">.</span>
            </h2>
          </div>
          <span className="subtle-label">
            <Layers3 size={14} /> Open workflows. Endless possibilities.
          </span>
        </div>
        <div className="browse-toolbar">
          <div className="search-field">
            <Search size={18} />
            <input
              aria-label="Search workflows"
              placeholder="Search workflows, models, or ideas..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
            <kbd>/</kbd>
          </div>
          <label className="sort-select">
            <TrendingUp size={15} />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort workflows"
            >
              <option value="popular">Most popular</option>
              <option value="newest">Recently added</option>
            </select>
            <ChevronDown size={13} />
          </label>
        </div>
        <div className="filter-row">
          <div className="category-tabs">
            {[
              ["", "All workflows"],
              ["Image", "Image generation"],
              ["Video", "Video & motion"],
              ["Upscaling", "Upscaling"],
              ["3D", "3D"],
              ["Other", "Other"],
            ].map(([value, label]) => (
              <button
                className={category === value ? "active" : ""}
                onClick={() => setCategory(value)}
                key={value}
              >
                {value === "" && <Grid2X2 size={13} />} {label}
              </button>
            ))}
          </div>
          <button
            className={`filter-button ${tag ? "active" : ""}`}
            onClick={() => setTag(tag ? "" : "sdxl")}
          >
            <SlidersHorizontal size={14} />
            {tag ? `${tag} ×` : "SDXL filter"}
          </button>
        </div>
        <div className="results-caption">
          <span>
            {loading
              ? "Finding your next idea..."
              : `${workflows.length} workflows to explore`}
          </span>
          <span>
            <span className="status-dot" /> Built to be understood, not just
            downloaded
          </span>
        </div>
        {error ? (
          <EmptyState
            title="The library is taking a moment"
            description={error}
            action={
              <button className="button" onClick={() => location.reload()}>
                Try again
              </button>
            }
          />
        ) : loading ? (
          <div className="workflow-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="skeleton-card" key={i}>
                <div />
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : workflows.length ? (
          <div className="workflow-grid">
            {workflows.map((workflow, index) => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                index={index}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="A little room for discovery"
            description={
              query || category || tag
                ? "No workflows match those filters. Try a broader search."
                : "Be the first to share a workflow with the community."
            }
            action={
              <Link className="button" href="/upload">
                Share a workflow <ArrowUpRight size={15} />
              </Link>
            }
          />
        )}
        {hasMore && !loading && (
          <div
            style={{ display: "flex", justifyContent: "center", marginTop: 25 }}
          >
            <button
              className="button secondary"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Finding more ideas..." : "Explore more workflows"}
              <ArrowRight size={14} />
            </button>
          </div>
        )}
        <div className="browse-end">
          <span>GOOD IDEAS ARE BETTER WHEN SHARED.</span>
          <Link href="/upload">
            What will you make possible? <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </div>
  );
}
export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="loading-page">Opening the creative toolkit...</div>
      }
    >
      <Discover />
    </Suspense>
  );
}
