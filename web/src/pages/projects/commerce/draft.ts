import localforage from "localforage";

export type ProductReference = { id: string; name: string; blob: Blob; width: number; height: number };
export type CommerceDraft = {
    version: 1;
    mode: "normal" | "advanced";
    references: ProductReference[];
    platform: string;
    platformRule?: string;
    merchantPlatformRules?: Record<string, string>;
    platformPlan?: { platformId: string; ruleId?: string; checkedAt: string; brief: string; issues: string[] };
    requirements: string;
    language: string;
    model: string;
    analysisModel?: string;
    size: string;
    quality: string;
    count: string;
    automatic: boolean;
    product: string;
    sellingPoints: string;
    audience: string;
    style: string;
    avoid: string;
};
export const emptyCommerceDraft: CommerceDraft = {
    version: 1,
    mode: "normal",
    references: [],
    platform: "智能匹配",
    platformRule: "",
    merchantPlatformRules: {},
    requirements: "",
    language: "简体中文",
    model: "",
    size: "",
    quality: "",
    count: "3",
    automatic: false,
    product: "",
    sellingPoints: "",
    audience: "",
    style: "",
    avoid: "",
};
const storage = localforage.createInstance({ name: "yingce", storeName: "commerce_drafts", driver: localforage.INDEXEDDB });
export const commerceDraftStorage = {
    read: (userId: string) => storage.getItem<CommerceDraft>(`main-image:user:${userId}`),
    save: (userId: string, draft: CommerceDraft) => storage.setItem(`main-image:user:${userId}`, draft),
};
export async function readProductReference(file: File, byteLimit: number): Promise<ProductReference> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error(`${file.name}：仅支持 JPG、PNG、WEBP`);
    if (!file.size || file.size > byteLimit) throw new Error(`${file.name}：图片大小须在 ${(byteLimit / 1024 / 1024).toFixed(1)} MB 以内`);
    const image = await createImageBitmap(file).catch(() => {
        throw new Error(`${file.name}：图片无法读取，请重新导出后上传`);
    });
    const reference = { id: crypto.randomUUID(), name: file.name, blob: file, width: image.width, height: image.height };
    image.close();
    return reference;
}
