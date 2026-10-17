"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileJson,
  Info,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { api, PageHeading, usePlatform } from "@/components/platform";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
export default function UploadPage() {
  const router = useRouter();
  const { user } = usePlatform();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError(
        "Choose a workflow JSON or an image containing ComfyUI metadata.",
      );
      return;
    }
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    data.set("file", file);
    data.set("adult", data.get("adult") === "on" ? "true" : "false");
    try {
      const result = await api<{ workflow: { id: string } }>("/api/workflows", {
        method: "POST",
        body: data,
      });
      router.push(`/workflows/${result.workflow.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-page">
      <PageHeading
        eyebrow="PUT YOUR PROCESS OUT THERE"
        title="Share a little possibility."
        description="Your clever connection could be someone else’s breakthrough. Upload a ComfyUI workflow and we’ll unpack the details."
      />
      <div className="upload-layout">
        <form className="panel" onSubmit={submit}>
          {!user && (
            <div className="notice">
              <Info size={17} />
              <span>
                You can prepare your upload here.{" "}
                <Link className="text-link" href="/auth">
                  Sign in
                </Link>{" "}
                before sharing it.
              </span>
            </div>
          )}
          <label
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              setFile(e.dataTransfer.files[0] || null);
            }}
          >
            <Upload size={29} />
            <strong>
              {file ? file.name : "Drop a workflow here, or browse"}
            </strong>
            <span>
              JSON workflows · PNG with workflow metadata · Up to 20 MB
            </span>
            <input
              type="file"
              accept=".json,.png,application/json,image/png"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file && (
              <span>{(file.size / 1024).toFixed(0)} KB · Ready to analyze</span>
            )}
          </label>
          <div className="field">
            <label htmlFor="title">Give it a name</label>
            <Input
              id="title"
              name="title"
              placeholder="Something worth creating"
              required
              maxLength={160}
            />
          </div>
          <div className="field">
            <label htmlFor="description">Tell the story</label>
            <Textarea
              id="description"
              name="description"
              placeholder="What does it make? What makes it useful? Share any tips to get started."
              required
              maxLength={10000}
            />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="category">Category</label>
              <select id="category" name="category">
                <option>Image</option>
                <option>Video</option>
                <option>Upscaling</option>
                <option>3D</option>
                <option>Audio</option>
                <option>Other</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="visibility">Who can see it?</label>
              <select id="visibility" name="visibility">
                <option value="PUBLIC">Public · Everyone</option>
                <option value="UNLISTED">
                  Unlisted · Anyone with the link
                </option>
                <option value="PRIVATE">Private · Only you</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="tags">Tags</label>
            <Input
              id="tags"
              name="tags"
              placeholder="SDXL, portrait, beginner-friendly"
            />
            <small>
              Separate tags with commas. Models and custom nodes are detected
              automatically.
            </small>
          </div>
          <label className="check-field">
            <input type="checkbox" name="adult" />
            <span>
              <strong>Contains adult content</strong>Hidden by default. Only
              shown to adults who explicitly opt in.
            </span>
          </label>
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          <div className="form-actions">
            <Button type="submit" disabled={busy}>
              {busy ? "Uploading & preparing analysis..." : "Share workflow"}
              <ArrowRight size={15} />
            </Button>
            <span className="muted" style={{ fontSize: 10 }}>
              You keep ownership of your work.
            </span>
          </div>
        </form>
        <aside>
          <div className="panel">
            <h2>A little less guesswork.</h2>
            <p className="prose-copy">
              We read your workflow, so everyone can understand what’s inside.
            </p>
            <ul className="help-list">
              <li>Native, interactive node preview</li>
              <li>Models and checkpoint references</li>
              <li>Custom-node packages</li>
              <li>Resolution and sampling settings</li>
              <li>Version history that stays connected</li>
            </ul>
            <div className="notice">
              <ShieldCheck size={18} />
              <span>
                Workflows are inspected, never executed. Custom nodes remain
                untrusted code.
              </span>
            </div>
          </div>
          <div className="panel" style={{ marginTop: 18 }}>
            <FileJson size={23} className="accent-text" />
            <h3 style={{ marginTop: 12 }}>Start with the original.</h3>
            <p className="prose-copy">
              Export your workflow from ComfyUI, or use an output image that
              still contains its workflow metadata. API-format JSON is supported
              for analysis; native canvas layout requires UI-format JSON.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
