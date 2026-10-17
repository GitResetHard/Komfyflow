"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  History,
  Info,
  LogOut,
  Mail,
  ShieldCheck,
} from "lucide-react";
import {
  api,
  EmptyState,
  PageHeading,
  usePlatform,
} from "@/components/platform";
import { WorkflowCard, type Workflow } from "@/components/workflow-card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
type Profile = {
  username: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
};
type HistoryEntry = {
  id: string;
  createdAt?: string;
  viewedAt?: string;
  workflow?: Workflow;
};
function Account() {
  const params = useSearchParams();
  const { user, refresh, toast } = usePlatform();
  const profileUser = params.get("user");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [bookmarks, setBookmarks] = useState<Workflow[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tab, setTab] = useState("Saved workflows");
  const [busy, setBusy] = useState(false);
  const [adult, setAdult] = useState(false);
  const [guestConfirmed, setGuestConfirmed] = useState(false);
  useEffect(() => {
    setAdult(user?.adultOptIn || false);
  }, [user]);
  useEffect(() => {
    const username = profileUser || user?.username;
    if (username)
      void api<{ profile: Profile; workflows: Workflow[] }>(
        `/api/profiles/${username}`,
      )
        .then((data) => {
          setProfile(data.profile);
          setWorkflows(data.workflows);
        })
        .catch((err) => toast(err.message));
    if (user && !profileUser) {
      void api<{ workflows: Workflow[] }>("/api/bookmarks")
        .then((d) => setBookmarks(d.workflows))
        .catch(() => {});
      void api<{ history: HistoryEntry[] }>("/api/history")
        .then((d) => setHistory(d.history))
        .catch(() => {});
    }
  }, [user, profileUser, toast]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: form.get("displayName"),
          bio: form.get("bio"),
          adultOptIn: adult,
        }),
      });
      await refresh();
      toast("Profile and preferences saved.");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function guestOptIn() {
    try {
      await api("/api/preferences", {
        method: "POST",
        body: JSON.stringify({ adultOptIn: guestConfirmed }),
      });
      toast(
        guestConfirmed
          ? "Adult content enabled for this browser."
          : "Adult content hidden for this browser.",
      );
    } catch (err) {
      toast((err as Error).message);
    }
  }
  if (profileUser)
    return (
      <div className="content-page">
        <PageHeading
          eyebrow="THE PEOPLE BEHIND THE PROCESS"
          title={profile?.displayName || profileUser}
          description={profile?.bio || `Workflows shared by @${profileUser}.`}
        />
        {workflows.length ? (
          <div className="workflow-grid">
            {workflows.map((workflow, index) => (
              <WorkflowCard
                workflow={workflow}
                index={index}
                key={workflow.id}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Every creator starts somewhere"
            description="There are no public workflows to show yet."
          />
        )}
      </div>
    );
  return (
    <div className="content-page">
      <PageHeading
        eyebrow="YOUR CORNER OF KOMFYFLOW"
        title={
          user
            ? `Good to see you, ${user.displayName || user.username}.`
            : "Make it your own."
        }
        description="Your profile, saved ideas, and a little control over what you see."
      >
        {user && (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                await api("/api/auth/logout", { method: "POST" });
                await refresh();
                toast("Signed out. See you next time.");
              } catch (err) {
                toast((err as Error).message);
              }
            }}
          >
            <LogOut size={14} /> Sign out
          </Button>
        )}
      </PageHeading>
      {!user ? (
        <>
          <EmptyState
            title="A workspace for your next idea"
            description="Create an account to save workflows, build collections, and share your own creative process."
            action={
              <Link href="/auth" className="button">
                Sign in or create account <ArrowUpRight size={15} />
              </Link>
            }
          />
          <div className="panel" style={{ maxWidth: 600 }}>
            <h2>Content preferences</h2>
            <p className="prose-copy">
              Adult content is hidden by default, including search results,
              previews, and direct links. This setting applies to this browser.
            </p>
            <label className="check-field">
              <input
                type="checkbox"
                checked={guestConfirmed}
                onChange={(e) => setGuestConfirmed(e.target.checked)}
              />
              <span>
                <strong>I am 18 or older and want to see adult content.</strong>
                You can turn this off at any time.
              </span>
            </label>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void guestOptIn()}
            >
              Save browser preference
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="settings-grid">
            <form className="panel" onSubmit={save}>
              <h2>A little about you</h2>
              <div className="field">
                <label htmlFor="displayName">Display name</label>
                <Input
                  id="displayName"
                  name="displayName"
                  defaultValue={user.displayName || user.username}
                  required
                  maxLength={100}
                />
              </div>
              <div className="field">
                <label htmlFor="bio">Bio</label>
                <Textarea
                  id="bio"
                  key={profile?.bio || "bio"}
                  name="bio"
                  defaultValue={profile?.bio || ""}
                  placeholder="What are you curious about?"
                  maxLength={1000}
                />
              </div>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={adult}
                  onChange={(e) => setAdult(e.target.checked)}
                />
                <span>
                  <strong>
                    I am 18 or older and want to see adult content.
                  </strong>
                  Off by default. Applies to search, galleries, direct links,
                  and embeds.
                </span>
              </label>
              <Button disabled={busy} size="sm">
                {busy ? "Saving..." : "Save profile & preferences"}
              </Button>
            </form>
            <div className="panel">
              <h2>Account & security</h2>
              <div className="metadata-row">
                <span>Username</span>
                <span>@{user.username}</span>
              </div>
              <div className="metadata-row">
                <span>Email</span>
                <span style={{ overflowWrap: "anywhere" }}>{user.email}</span>
              </div>
              <div className="metadata-row">
                <span>Email status</span>
                <span className={`status-pill ${user.verified ? "" : "warn"}`}>
                  <i />
                  {user.verified ? "Verified" : "Not verified"}
                </span>
              </div>
              {!user.verified && (
                <>
                  <div className="notice">
                    <Mail size={17} />
                    <span>
                      Check your inbox to confirm your email address. A verified
                      email keeps your account recoverable.
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      try {
                        const data = await api<{ message?: string }>(
                          "/api/auth/resend",
                          { method: "POST" },
                        );
                        toast(data.message || "Verification email requested.");
                      } catch (err) {
                        toast((err as Error).message);
                      }
                    }}
                  >
                    Resend verification email
                  </Button>
                  <Link
                    href="/auth?mode=verify"
                    className="text-link"
                    style={{ display: "block", marginTop: 13 }}
                  >
                    Have a verification token? →
                  </Link>
                </>
              )}
              <div style={{ marginTop: 25 }}>
                <Link href="/auth?mode=recover" className="text-link">
                  Reset your password →
                </Link>
              </div>
              <div className="notice">
                <ShieldCheck size={17} />
                <span>
                  Your preferences are private. Public profiles show only your
                  display name, bio, and published workflows.
                </span>
              </div>
            </div>
          </div>
          <div className="detail-tabs">
            {["Saved workflows", "Your workflows", "Recently viewed"].map(
              (name) => (
                <button
                  className={tab === name ? "active" : ""}
                  key={name}
                  onClick={() => setTab(name)}
                >
                  {name}
                </button>
              ),
            )}
          </div>
          <div className="tab-content">
            {tab === "Recently viewed" && history.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                style={{ marginBottom: 15 }}
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Clear your viewing history? Your saved workflows will stay in your library.",
                    )
                  )
                    return;
                  try {
                    await api("/api/history", { method: "DELETE" });
                    setHistory([]);
                    toast("Viewing history cleared.");
                  } catch (err) {
                    toast((err as Error).message);
                  }
                }}
              >
                Clear viewing history
              </Button>
            )}
            {tab === "Recently viewed" ? (
              history.length ? (
                history.map((item) => (
                  <div className="history-item" key={item.id}>
                    <Link href={`/workflows/${item.workflow?.id}`}>
                      {item.workflow?.title || "Workflow no longer available"}
                    </Link>
                    <time>
                      {item.viewedAt || item.createdAt
                        ? new Date(
                            item.viewedAt || item.createdAt!,
                          ).toLocaleString()
                        : ""}
                    </time>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="Follow your curiosity"
                  description="The workflows you visit will appear here."
                />
              )
            ) : (tab === "Saved workflows" ? bookmarks : workflows).length ? (
              <div className="workflow-grid">
                {(tab === "Saved workflows" ? bookmarks : workflows).map(
                  (workflow, index) => (
                    <WorkflowCard
                      workflow={workflow}
                      index={index}
                      key={workflow.id}
                    />
                  ),
                )}
              </div>
            ) : (
              <EmptyState
                title={
                  tab === "Saved workflows"
                    ? "Keep the good ones close."
                    : "Your process deserves a place."
                }
                description={
                  tab === "Saved workflows"
                    ? "Bookmark a workflow to find it here later."
                    : "Share a workflow and help someone create something new."
                }
                action={
                  <Link
                    href={tab === "Saved workflows" ? "/" : "/upload"}
                    className="button secondary"
                  >
                    {tab === "Saved workflows"
                      ? "Discover workflows"
                      : "Share a workflow"}
                  </Link>
                }
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
export default function Page() {
  return (
    <Suspense
      fallback={<div className="loading-page">Opening your workspace...</div>}
    >
      <Account />
    </Suspense>
  );
}
