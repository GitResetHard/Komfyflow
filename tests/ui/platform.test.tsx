// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { Suspense } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlatformProvider, Shell, api } from "@/components/platform";
import { WorkflowCard } from "@/components/workflow-card";
import UploadPage from "@/app/upload/page";
import AuthPage from "@/app/auth/page";
import CollectionsPage from "@/app/collections/page";
import DetailPage from "@/app/workflows/[id]/page";
import AccountPage from "@/app/account/page";
const { push, search } = vi.hoisted(() => ({
  push: vi.fn(),
  search: new URLSearchParams(),
}));
vi.mock("@/components/workflow-viewer", () => ({
  default: ({ workflow }: { workflow: unknown }) => (
    <div data-testid="native-viewer">{JSON.stringify(workflow)}</div>
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/account",
  useRouter: () => ({ push }),
  useSearchParams: () => search,
}));
const user = {
  id: "u1",
  username: "maker",
  displayName: "Maker",
  email: "maker@example.test",
  adultOptIn: false,
  verified: true,
};
const workflow = {
  id: "w1",
  title: "Sample workflow",
  description: "An explicitly illustrative sample.",
  category: "Image",
  tags: ["sdxl"],
  adult: false,
  author: { username: "maker" },
  _count: { likes: 2, comments: 0 },
  versions: [{ id: "v1", number: 1, status: "READY", nodes: 7, links: 9 }],
};
const response = (data: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: async () => data,
  } as Response);
function setup(
  resolver?: (url: string, init?: RequestInit) => Promise<Response>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") return response({ user });
      return resolver ? resolver(url, init) : response({});
    }),
  );
}
function mount(component: React.ReactNode) {
  return render(<PlatformProvider>{component}</PlatformProvider>);
}
beforeEach(() => {
  push.mockReset();
  search.forEach((_, key) => search.delete(key));
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-accent");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("platform interactions", () => {
  it("persists light theme and accent choices while showing account identity", async () => {
    setup();
    const actor = userEvent.setup();
    mount(
      <Shell>
        <p>Workspace</p>
      </Shell>,
    );
    await screen.findByText("MA");
    await actor.click(
      screen.getByRole("button", { name: "Switch to light theme" }),
    );
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("komfy-theme")).toBe("light");
    await actor.click(screen.getByRole("button", { name: "teal accent" }));
    expect(document.documentElement.dataset.accent).toBe("teal");
    expect(localStorage.getItem("komfy-accent")).toBe("teal");
  });
  it("rejects a completed upload form without a workflow file", async () => {
    setup();
    mount(<UploadPage />);
    fireEvent.change(screen.getByLabelText("Give it a name"), {
      target: { value: "My workflow" },
    });
    fireEvent.change(screen.getByLabelText("Tell the story"), {
      target: { value: "Useful workflow" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Share workflow" }).closest("form")!,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a workflow",
    );
    expect(push).not.toHaveBeenCalled();
  });
  it("uploads multipart data and navigates to the saved workflow", async () => {
    setup((url, init) => {
      if (url === "/api/workflows") {
        expect(init?.body).toBeInstanceOf(FormData);
        expect((init!.body as FormData).get("adult")).toBe("false");
        return response({ workflow: { id: "new-workflow" } });
      }
      return response({});
    });
    const { container } = mount(<UploadPage />);
    fireEvent.change(screen.getByLabelText("Give it a name"), {
      target: { value: "My workflow" },
    });
    fireEvent.change(screen.getByLabelText("Tell the story"), {
      target: { value: "Useful workflow" },
    });
    fireEvent.change(container.querySelector("input[type=file]")!, {
      target: {
        files: [
          new File(['{"nodes":[]}'], "workflow.json", {
            type: "application/json",
          }),
        ],
      },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Share workflow" }).closest("form")!,
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/workflows/new-workflow"),
    );
  });
  it("shows numeric node counts and toggles likes from the server result", async () => {
    setup((url) => response(url.endsWith("/like") ? { active: true } : {}));
    const actor = userEvent.setup();
    mount(<WorkflowCard workflow={workflow} />);
    expect(screen.getByTitle("Nodes").textContent).toBe("7");
    await actor.click(screen.getByRole("button", { name: "Like workflow" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Unlike workflow" }).textContent,
      ).toBe("3"),
    );
  });
  it("surfaces authentication errors without claiming a successful login", async () => {
    setup((url) =>
      url === "/api/auth/login"
        ? response({ error: "Invalid credentials" }, 401)
        : response({}),
    );
    mount(<AuthPage />);
    fireEvent.change(screen.getByLabelText("Email or username"), {
      target: { value: "maker" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong" },
    });
    fireEvent.submit(screen.getByLabelText("Password").closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid credentials",
    );
    expect(push).not.toHaveBeenCalled();
  });
  it("creates and opens a collection using real endpoint shapes", async () => {
    let created = false;
    setup((url, init) => {
      if (url === "/api/collections" && init?.method === "POST") {
        created = true;
        return response({ collection: { id: "c1", name: "Ideas" } });
      }
      if (url === "/api/collections")
        return response({
          collections: created
            ? [{ id: "c1", name: "Ideas", _count: { items: 1 } }]
            : [],
        });
      if (url === "/api/collections/c1")
        return response({
          collection: { id: "c1", name: "Ideas", items: [{ workflow }] },
        });
      return response({});
    });
    const actor = userEvent.setup();
    mount(<CollectionsPage />);
    await screen.findByPlaceholderText("Name a new collection");
    await actor.type(
      screen.getByPlaceholderText("Name a new collection"),
      "Ideas",
    );
    await actor.click(
      screen.getByRole("button", { name: "Create collection" }),
    );
    const shelf = await screen.findByRole("button", {
      name: /Ideas 1 workflows/,
    });
    await actor.click(shelf);
    expect(await screen.findByText("Sample workflow")).toBeTruthy();
  });
  it("keeps guest adult content off until explicit checkbox submission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url === "/api/auth/me") return response({ user: null });
        return response({
          adultOptIn: JSON.parse(String(init?.body)).adultOptIn,
        });
      }),
    );
    const actor = userEvent.setup();
    mount(<AccountPage />);
    const checkbox = screen.getByRole("checkbox");
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    await actor.click(checkbox);
    await actor.click(
      screen.getByRole("button", { name: "Save browser preference" }),
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/preferences",
        expect.objectContaining({
          method: "POST",
          body: '{"adultOptIn":true}',
        }),
      ),
    );
  });
  it("coalesces repeated like clicks while the first request is pending", async () => {
    let finish: ((value: Response) => void) | undefined;
    setup((url) =>
      url.endsWith("/like")
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : response({}),
    );
    mount(<WorkflowCard workflow={workflow} />);
    const button = screen.getByRole("button", { name: "Like workflow" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter((call) => String(call[0]).endsWith("/like")),
    ).toHaveLength(1);
    finish!({ ok: true, json: async () => ({ active: true }) } as Response);
    await screen.findByRole("button", { name: "Unlike workflow" });
  });
  it("switches the native preview to the selected version and downloads the original", async () => {
    setup((url) => {
      if (url === "/api/workflows/w1")
        return response({
          workflow: {
            ...workflow,
            versions: [
              { id: "v2", number: 2, status: "READY", nodes: 8, links: 10 },
              { id: "v1", number: 1, status: "READY", nodes: 7, links: 9 },
            ],
          },
        });
      if (url.includes("/source"))
        return response({ nodes: [], version: url.includes("v1") ? 1 : 2 });
      if (url.endsWith("/comments")) return response({ comments: [] });
      if (url.endsWith("/examples")) return response({ examples: [] });
      if (url === "/api/collections") return response({ collections: [] });
      return response({});
    });
    await act(async () => {
      mount(
        <Suspense fallback={<p>Loading page</p>}>
          <DetailPage params={Promise.resolve({ id: "w1" })} />
        </Suspense>,
      );
    });
    await screen.findByTestId("native-viewer");
    expect(screen.getByTestId("native-viewer").textContent).toContain(
      '"version":2',
    );
    fireEvent.change(screen.getByLabelText("Version"), {
      target: { value: "v1" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("native-viewer").textContent).toContain(
        '"version":1',
      ),
    );
    expect(
      screen
        .getByRole("link", { name: "Download original" })
        .getAttribute("href"),
    ).toBe("/api/workflows/w1/download?version=v1");
  });
  it("propagates structured API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => response({ error: "Access denied" }, 403)),
    );
    await expect(api("/denied")).rejects.toThrow("Access denied");
  });
});
