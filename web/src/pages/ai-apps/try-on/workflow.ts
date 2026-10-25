import type { ReferenceImage } from "@/types/image";
import { validColorHex, type ColorEditOptions } from "./color-palette";

export const tryOnTools = [
    { id: "outfit", title: "万物上身", hint: "服装、鞋履与配饰，一次完成整套搭配" },
    { id: "flat", title: "平铺／人台试衣", hint: "将平铺或人台服装转为真人穿搭" },
    { id: "shoes", title: "鞋靴试穿", hint: "还原鞋型、鞋底与上脚比例" },
    { id: "accessory", title: "AI 试戴", hint: "包袋、首饰、帽子与眼镜的佩戴效果" },
    { id: "model", title: "AI 换模特", hint: "保留商品与画面，更换出镜模特" },
    { id: "pose", title: "模特换姿势", hint: "保留模特与穿搭，调整动作姿态" },
    { id: "face", title: "AI 换脸", hint: "保留服装与构图，替换面部参考" },
    { id: "color", title: "AI 换色", hint: "保留商品版型，尝试新的配色" },
] as const;
export type TryOnTool = typeof tryOnTools[number];
export const tryOnGuides: Record<TryOnTool["id"], { productLabel: string; productHint: string; maxProducts: number; referenceLabel: string; smartLabel: string; smartHint: string; placeholder: string; targetRequired: boolean }> = {
    outfit: { productLabel: "商品图", productHint: "多件商品组合为同一套穿搭，保留版型、图案、颜色和材质。", maxProducts: 10, referenceLabel: "参考模特图", smartLabel: "自动匹配模特", smartHint: "按商品和描述匹配模特；有参考图时保留其人物、姿态与场景。", placeholder: "例如：城市街拍，自然行走，保持商品图案与材质。", targetRequired: false },
    flat: { productLabel: "平铺／人台服装图", productHint: "上传平铺或人台服装，移除衣架与人台，按真实人体重建衣物体积。", maxProducts: 2, referenceLabel: "参考模特图", smartLabel: "自动匹配试衣模特", smartHint: "按服装匹配模特；参考图只作为人物、动作和场景基准。", placeholder: "例如：成年模特自然站姿，全身棚拍，保留领口、袖长与垂坠感。", targetRequired: false },
    shoes: { productLabel: "鞋靴商品图", productHint: "单视角上传 1 张；多视角上传同款鞋的双脚、外侧、内侧图。", maxProducts: 3, referenceLabel: "参考上脚图", smartLabel: "自动匹配上脚模特", smartHint: "默认成年模特膝下近景；参考图用于保留人物、姿态与场景。", placeholder: "例如：自然站立，完整展示鞋尖和鞋跟，保持鞋底厚度与标志。", targetRequired: false },
    accessory: { productLabel: "配饰商品图", productHint: "上传商品静物图，按真实佩戴位置、尺度和承重点展示。", maxProducts: 1, referenceLabel: "参考佩戴图", smartLabel: "自动匹配佩戴模特", smartHint: "按配饰选择展示部位；有参考图时保留其人物及其余画面。", placeholder: "描述佩戴方式、展示部位与场景。", targetRequired: false },
    model: { productLabel: "原模特图", productHint: "上传 1 张原模特照，更换人物并保留服装、动作、背景和光线。", maxProducts: 1, referenceLabel: "目标模特参考图", smartLabel: "上传目标模特", smartHint: "目标人物由你上传的参考图提供，仅借用人物特征，保留原图服装、动作与场景。", placeholder: "例如：采用目标参考人物的发型和肤色，保留原服装、姿态与背景。", targetRequired: false },
    pose: { productLabel: "原模特图", productHint: "上传 1 张原模特照，只改变动作及相应褶皱，保留人物、商品与背景。", maxProducts: 1, referenceLabel: "目标姿态参考图", smartLabel: "按文字调整姿态", smartHint: "请在下方描述目标动作，或上传姿态图；姿态图不提供人脸和服装。", placeholder: "例如：身体转向左侧 45 度，右手自然垂落，保留原人物和穿搭。", targetRequired: true },
    face: { productLabel: "原模特图", productHint: "上传 1 张原模特照，只替换脸部，保留原发型、身体、肤色、服装和场景。", maxProducts: 1, referenceLabel: "目标人脸参考图", smartLabel: "上传目标人脸", smartHint: "目标面部由你上传的参考图提供，肤色与光线跟随原图，不复制参考图发型、服装或背景。", placeholder: "例如：保留原图表情、发型与妆容，仅替换为目标参考的人脸特征。", targetRequired: false },
    color: { productLabel: "待换色商品／模特图", productHint: "上传 1 张原图，只改变指定商品颜色，保留纹理、印花、人物和场景。", maxProducts: 1, referenceLabel: "目标配色参考图", smartLabel: "按文字指定颜色", smartHint: "请描述目标商品与颜色，或上传配色图；参考图不提供款式和材质。", placeholder: "例如：将外套底布改为海军蓝，白色标志、拉链和其他衣物保持不变。", targetRequired: true },
};

export type PoseMode = "smart" | "text" | "reference";
export const poseModes = [
    { id: "smart", label: "智能换姿" },
    { id: "text", label: "文字换姿" },
    { id: "reference", label: "以图换姿" },
] as const;

export function tryOnInputError(tool: TryOnTool, productCount: number, referenceMode: string, referenceCount: number, description: string, poseMode?: PoseMode, colorEdit?: ColorEditOptions) {
    const guide = tryOnGuides[tool.id];
    if (!productCount) return `请先上传${guide.productLabel}`;
    if (productCount > guide.maxProducts) return `${guide.productLabel}最多 ${guide.maxProducts} 张，请移除多余图片`;
    if ((tool.id === "model" || tool.id === "face") && (referenceMode !== "reference" || referenceCount !== 1)) return `请上传 1 张${guide.referenceLabel}，目标人物需由你提供`;
    if (referenceMode === "reference" && !referenceCount) return `请上传${guide.referenceLabel}`;
    if (tool.id === "color" && colorEdit) {
        if (!colorEdit.target.trim()) return "请填写换色对象";
        if (colorEdit.mode === "reference" && referenceCount !== 1) return "请只上传 1 张配色参考图";
        if ((colorEdit.mode === "palette" || colorEdit.hex) && !validColorHex(colorEdit.hex)) return "请输入有效的六位 HEX 色值，例如 #B9D4E4";
        return "";
    }
    if (guide.targetRequired && referenceMode === "smart" && !(tool.id === "pose" && poseMode === "smart") && !description.trim()) return `请填写${tool.id === "pose" ? "目标动作" : tool.id === "face" ? "目标面部特征" : "目标商品与颜色"}，或上传${guide.referenceLabel}`;
    return "";
}
export type ShoeView = "pair" | "outer" | "inner";
export type GarmentSlot = "upper" | "lower" | "full";
export type FlatMode = "separates" | "onepiece";
export const accessoryTypes = [
    { id: "bag", label: "包包", hint: "上传包包静物图，完整展示包身、包带与五金，不建议使用模特图。", placeholder: "例如：自然单肩背，保留包型、肩带长度与五金标志。", modelHint: "按包型选择手持、肩背或斜挎，展示包身与包带；参考图用于保留人物和穿搭。" },
    { id: "belt", label: "腰带腰链", hint: "上传完整腰带或腰链静物图，清晰展示带扣、链节和材质。", placeholder: "例如：腰带穿过裤腰带袢，带扣居中，保留扣型和皮革纹理。", modelHint: "以腰部及服装搭配为展示重点，保持腰带／腰链的真实尺度和走向。" },
    { id: "necklace", label: "项链", hint: "上传项链静物图，完整展示链条、吊坠和连接细节。", placeholder: "例如：项链自然垂落在锁骨下方，保持吊坠形状与链条长度。", modelHint: "以颈部和项链为展示重点，保留链条垂坠与吊坠位置，避免衣领遮住商品。" },
    { id: "glasses", label: "墨镜眼镜", hint: "上传清晰眼镜静物图，展示镜框、镜片、鼻托与镜腿。", placeholder: "例如：正面自然佩戴，镜腿贴合耳侧，保留镜框形状和镜片色泽。", modelHint: "以面部佩戴为展示重点，保持参考人物五官，匹配鼻梁和耳侧接触。" },
    { id: "bracelet", label: "手链手表", hint: "上传手链或手表静物图，清晰展示链节、表盘与表带。", placeholder: "例如：手腕自然放松，清楚展示表盘与表带，保持尺寸比例。", modelHint: "以手腕为展示重点，保持真实手部结构及腕带贴合，清楚展示商品正面。" },
    { id: "hat", label: "帽子", hint: "上传帽子静物图，完整展示帽冠、帽檐、图案和标志。", placeholder: "例如：自然正戴，保留帽檐弧度、帽冠高度和原有标志。", modelHint: "以头部佩戴为展示重点，帽子贴合头围，保留参考人物面部身份。" },
    { id: "ring", label: "戒指", hint: "上传戒指静物图，清晰展示戒圈、戒面和镶嵌结构。", placeholder: "例如：戴于食指，手指自然伸展，保留宝石切面与金属细节。", modelHint: "以手指和戒指为展示重点，保持真实指节结构、佩戴尺度和遮挡关系。" },
] as const;
export type AccessoryType = typeof accessoryTypes[number]["id"];
export type TryOnProduct = ReferenceImage & { shoeView?: ShoeView; garmentSlot?: GarmentSlot };
export function replaceGarmentSlot(images: TryOnProduct[], image: ReferenceImage, garmentSlot: GarmentSlot): TryOnProduct[] {
    return [...images.filter((item) => item.garmentSlot !== garmentSlot), { ...image, garmentSlot }].sort((a, b) => ["upper", "lower", "full"].indexOf(a.garmentSlot!) - ["upper", "lower", "full"].indexOf(b.garmentSlot!));
}

export function flatModeProducts(images: TryOnProduct[], mode: FlatMode) {
    return images.filter((image) => mode === "onepiece" ? image.garmentSlot === "full" : image.garmentSlot === "upper" || image.garmentSlot === "lower");
}

export const tryOnGenerationModes = [
    { id: "professional", title: "专业模式", description: "还原版型与材质", hint: "适合服装与配饰的电商 lookbook，保持商品细节和自然穿着效果。" },
    { id: "children", title: "内衣／童装", description: "专用商品展示", hint: "内衣仅使用成年模特；童装采用非性感的日常展示，突出服装本身。" },
] as const;
export function replaceShoeView(images: TryOnProduct[], image: ReferenceImage, shoeView: ShoeView): TryOnProduct[] {
    return [...images.filter((item) => item.shoeView !== shoeView), { ...image, shoeView }].sort((a, b) => ["pair", "outer", "inner"].indexOf(a.shoeView!) - ["pair", "outer", "inner"].indexOf(b.shoeView!));
}

export function tryOnIntent(tool: TryOnTool, productCount: number, hasModel: boolean, description: string, childrenMode: boolean, hasAnchor = false, shoeViews?: ShoeView[], garmentSlots?: GarmentSlot[], accessoryType?: AccessoryType, poseMode?: PoseMode, colorEdit?: ColorEditOptions) {
    return { tool: tool.id, productCount, referenceMode: hasModel ? "reference" : "smart", description, generationMode: childrenMode ? "children" : "professional", hasAnchor, ...(shoeViews ? { shoeViews } : {}), ...(garmentSlots ? { garmentSlots } : {}), ...(accessoryType ? { accessoryType } : {}), ...(tool.id === "pose" ? { poseMode: poseMode || (hasModel ? "reference" : "text") } : {}), ...(tool.id === "color" && colorEdit ? { colorEdit } : {}) };
}

export function tryOnReferences(products: ReferenceImage[], model?: ReferenceImage, anchor?: ReferenceImage) {
    return [...products, ...(model ? [model] : []), ...(anchor ? [anchor] : [])];
}

export const descriptionPresets = [
    { title: "城市街拍", text: "自然行走姿态，城市街道，柔和日光，真实时尚街拍，突出穿搭与商品细节。" },
    { title: "纯色棚拍", text: "干净的浅灰背景，自然站姿，柔和棚拍灯光，全身构图，清晰展示商品版型。" },
    { title: "休闲日常", text: "轻松自然的日常造型，简洁背景，舒适姿态，真实生活感与自然肤色。" },
    { title: "质感大片", text: "克制的杂志摄影构图，细腻材质、清晰轮廓，低饱和环境，突出商品质感。" },
];

export function descriptionPresetsFor(tool: TryOnTool["id"], hasReference = false) {
    if (hasReference && (tool === "outfit" || tool === "flat")) return [{ title: "保留参考画面", text: "沿用参考人物、动作、构图、背景与光线，仅替换当前上传的商品。" }, { title: "还原商品", text: "忠实还原商品版型、图案、颜色与材质，仅调整自然穿着所需的褶皱和接触阴影。" }];
    const editPresets = {
        shoes: [{ title: "完整展示双鞋", text: "自然站立，清楚呈现双鞋轮廓、鞋尖与鞋跟，保持真实脚部透视与地面接触。" }, { title: "保留鞋款", text: "保持鞋楦、鞋底厚度、材质与可见标志，保留参考图其他区域；无参考时采用膝下取景。" }],
        accessory: [{ title: "自然佩戴", text: "按所选品类匹配佩戴部位、承重点及遮挡，商品真实贴合，不改变其他穿搭。" }, { title: "保留商品细节", text: "还原配饰轮廓、材质、五金与标志，保持真实尺度，保留参考人物和场景。" }],
        model: [{ title: "保留穿搭", text: "仅更换目标参考人物，服装、配饰、图案与材质保持原图一致。" }, { title: "保留画面", text: "原动作、构图、背景与光线保持不变，只调整必要的人物融合。" }],
        face: [{ title: "自然融合", text: "仅替换目标参考的人脸特征，保留原表情、发型和肤色，边缘自然融合。" }, { title: "保留原图", text: "身体、服装、配饰、动作、背景与光线保持原样。" }],
        pose: [{ title: "自然错步", text: "身体轻微侧转，双脚自然错步站立，手臂放松，保留原人物与服装。" }, { title: "展示版型", text: "手臂稍离开腰线，避免遮住门襟和下摆，保持自然重心及原场景。" }],
        color: [{ title: "保留标志", text: "只改变指定底布颜色，印花、标志、缝线及五金保持原样。" }, { title: "保留质感", text: "保留原面料纹理、褶皱、高光和阴影，不对人物或背景施加滤镜。" }],
    };
    return tool in editPresets ? editPresets[tool as keyof typeof editPresets] : descriptionPresets;
}
