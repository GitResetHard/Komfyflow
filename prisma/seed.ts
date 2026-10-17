import { randomBytes, createHash } from "node:crypto";
import { db } from "../src/lib/server/db";
import { hashPassword } from "../src/lib/server/security";
import { writeObject } from "../src/lib/server/storage";
import { analyzeWorkflow, createPreviewGraph } from "../src/analysis";
const examples = [
  {
    id: "sample-cinematic-landscape",
    title: "Cinematic landscapes with SDXL",
    category: "Image",
    art: "landscape",
    tags: ["sdxl", "landscape", "beginner"],
    prompt:
      "A quiet alpine lake under golden evening light, cinematic photography",
  },
  {
    id: "sample-portrait-studio",
    title: "Soft-light portrait studio",
    category: "Image",
    art: "portrait",
    tags: ["portrait", "sdxl", "photography"],
    prompt:
      "Editorial portrait in soft window light, neutral studio background",
  },
  {
    id: "sample-architecture-study",
    title: "Architectural concept explorer",
    category: "Image",
    art: "architecture",
    tags: ["architecture", "concept", "sdxl"],
    prompt:
      "Modern minimal concrete pavilion among trees, architectural visualization",
  },
  {
    id: "sample-abstract-materials",
    title: "Abstract material experiments",
    category: "Image",
    art: "abstract",
    tags: ["abstract", "materials", "experimental"],
    prompt: "Sculptural iridescent material, abstract folds, studio lighting",
  },
  {
    id: "sample-product-stilllife",
    title: "Product still life essentials",
    category: "Image",
    art: "stilllife",
    tags: ["product", "lighting", "beginner"],
    prompt:
      "Minimal ceramic objects on a warm stone pedestal, product photography",
  },
  {
    id: "sample-motion-storyboard",
    title: "Motion storyboard starter",
    category: "Image",
    art: "motion",
    tags: ["storyboard", "concept", "composition"],
    prompt:
      "Dynamic silhouette walking through a neon city, cinematic storyboard",
  },
];
async function main() {
  const user = await db.user.upsert({
    where: { username: "komfyflow" },
    update: {},
    create: {
      username: "komfyflow",
      email: "samples@komfyflow.invalid",
      displayName: "Komfyflow Studio",
      bio: "Official illustrative sample workflows. Thumbnail illustrations are design artwork, not generated workflow outputs.",
      passwordHash: await hashPassword(randomBytes(48).toString("hex")),
      verified: true,
    },
  });
  for (const [index, item] of examples.entries()) {
    if (await db.workflow.findUnique({ where: { id: item.id } })) {
      await db.workflow.update({
        where: { id: item.id },
        data: { category: item.category },
      });
      continue;
    }
    const graph = {
      last_node_id: 7,
      last_link_id: 9,
      nodes: [
        {
          id: 1,
          type: "CheckpointLoaderSimple",
          pos: [50, 240],
          size: [280, 100],
          widgets_values: ["sd_xl_base_1.0.safetensors"],
          inputs: [],
          outputs: [
            { name: "MODEL", type: "MODEL", links: [1] },
            { name: "CLIP", type: "CLIP", links: [2, 3] },
            { name: "VAE", type: "VAE", links: [8] },
          ],
        },
        {
          id: 2,
          type: "CLIPTextEncode",
          pos: [380, 60],
          size: [340, 180],
          widgets_values: [item.prompt],
          inputs: [{ name: "clip", type: "CLIP", link: 2 }],
          outputs: [{ name: "CONDITIONING", type: "CONDITIONING", links: [4] }],
        },
        {
          id: 3,
          type: "CLIPTextEncode",
          pos: [380, 300],
          size: [340, 150],
          widgets_values: ["blurry, low quality"],
          inputs: [{ name: "clip", type: "CLIP", link: 3 }],
          outputs: [{ name: "CONDITIONING", type: "CONDITIONING", links: [5] }],
        },
        {
          id: 4,
          type: "EmptyLatentImage",
          pos: [390, 520],
          size: [280, 110],
          widgets_values: [1024, 1024, 1],
          inputs: [],
          outputs: [{ name: "LATENT", type: "LATENT", links: [6] }],
        },
        {
          id: 5,
          type: "KSampler",
          pos: [780, 130],
          size: [300, 310],
          widgets_values: [42 + index, "fixed", 24, 7, "euler", "normal", 1],
          inputs: [
            { name: "model", type: "MODEL", link: 1 },
            { name: "positive", type: "CONDITIONING", link: 4 },
            { name: "negative", type: "CONDITIONING", link: 5 },
            { name: "latent_image", type: "LATENT", link: 6 },
          ],
          outputs: [{ name: "LATENT", type: "LATENT", links: [7] }],
        },
        {
          id: 6,
          type: "VAEDecode",
          pos: [1130, 190],
          size: [230, 90],
          inputs: [
            { name: "samples", type: "LATENT", link: 7 },
            { name: "vae", type: "VAE", link: 8 },
          ],
          outputs: [{ name: "IMAGE", type: "IMAGE", links: [9] }],
        },
        {
          id: 7,
          type: "SaveImage",
          pos: [1410, 190],
          size: [250, 120],
          widgets_values: ["Komfyflow"],
          inputs: [{ name: "images", type: "IMAGE", link: 9 }],
          outputs: [],
        },
      ],
      links: [
        [1, 1, 0, 5, 0, "MODEL"],
        [2, 1, 1, 2, 0, "CLIP"],
        [3, 1, 1, 3, 0, "CLIP"],
        [4, 2, 0, 5, 1, "CONDITIONING"],
        [5, 3, 0, 5, 2, "CONDITIONING"],
        [6, 4, 0, 5, 3, "LATENT"],
        [7, 5, 0, 6, 0, "LATENT"],
        [8, 1, 2, 6, 1, "VAE"],
        [9, 6, 0, 7, 0, "IMAGE"],
      ],
      groups: [],
      config: {},
      extra: {},
      version: 0.4,
    };
    const bytes = Buffer.from(JSON.stringify(graph, null, 2));
    const sourceKey = `samples/${item.id}.json`;
    try {
      await writeObject(sourceKey, bytes);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const report = analyzeWorkflow(bytes, `${item.id}.json`);
    await db.workflow.create({
      data: {
        id: item.id,
        title: item.title,
        description:
          "Illustrative sample workflow for exploring Komfyflow. Review the required checkpoint before running in ComfyUI. The cover is original illustration artwork, not an example generated result.",
        category: item.category,
        thumbnailUrl: `/art/${item.art}.svg`,
        visibility: "PUBLIC",
        authorId: user.id,
        tags: {
          create: item.tags.map((name) => ({
            tag: { connectOrCreate: { where: { name }, create: { name } } },
          })),
        },
        versions: {
          create: {
            number: 1,
            sourceKey,
            originalName: `${item.id}.json`,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            bytes: bytes.length,
            status: "READY",
            nodes: report.nodes.length,
            links: report.links.length,
            preview: JSON.parse(JSON.stringify(createPreviewGraph(graph))),
            analysis: JSON.parse(JSON.stringify(report)),
          },
        },
      },
    });
  }
  console.info(
    "Seeded six explicitly labelled sample workflows. No login account password was published.",
  );
}
main().finally(() => db.$disconnect());
