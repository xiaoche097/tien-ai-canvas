import type { BackendGenerationMode } from "@/services/api/generation-task";

export type AiAppCategory = "广告与创意" | "电商" | "时尚与模特" | "实用工具";

export type AiApplication = {
    id: string;
    name: string;
    category: AiAppCategory;
    mode: BackendGenerationMode | "utility";
    summary: string;
    description: string;
    referenceLabels: string[];
    maskIndex?: number;
    promptPlaceholder: string;
    promptPrefix: string;
    tags: string[];
};

export const AI_APP_CATEGORIES: Array<"全部" | AiAppCategory> = ["全部", "广告与创意", "电商", "时尚与模特", "实用工具"];

export const AI_APPLICATIONS: AiApplication[] = [
    { id: "image-generation", name: "图像生成", category: "广告与创意", mode: "image", summary: "融合文字与参考素材，生成完整商业画面。", description: "适合从创意描述、草图或参考图快速产出广告视觉。", referenceLabels: ["参考图（可选）"], promptPlaceholder: "描述主体、构图、材质、灯光与画面风格", promptPrefix: "生成一张完成度高的商业创意图。", tags: ["文生图", "参考图"] },
    { id: "product-swap", name: "产品替换", category: "广告与创意", mode: "image", summary: "保留原图构图与氛围，替换画面中的商品。", description: "上传场景原图与目标商品图，生成自然融合的替换结果。", referenceLabels: ["场景原图", "目标商品图"], promptPlaceholder: "补充替换位置、保留内容和融合要求", promptPrefix: "将第一张图中的产品替换为第二张图的产品，严格保留目标产品外观，并保持原场景构图、光影和透视。", tags: ["商品替换", "合成"] },
    { id: "local-replace", name: "局部替换", category: "广告与创意", mode: "image", summary: "按遮罩与描述重绘指定区域，保持其他区域不变。", description: "用于局部改色、改材质、替换物体和瑕疵修复。", referenceLabels: ["待编辑图片", "区域遮罩图"], maskIndex: 1, promptPlaceholder: "说明要替换的区域与替换后的内容", promptPrefix: "仅修改遮罩标记的局部区域，未标记部分保持像素级视觉一致。", tags: ["局部重绘", "修图"] },
    { id: "white-packshot", name: "通用白底图精修", category: "电商", mode: "image", summary: "生成干净、统一、可上架的专业白底商品图。", description: "自动校正摆放、轮廓、阴影和商品质感。", referenceLabels: ["商品原图"], promptPlaceholder: "补充精修要求，例如阴影强度、摆放角度", promptPrefix: "将商品精修为电商级纯白背景主图，完整保留商品结构、颜色、商标和材质细节，添加自然接触阴影。", tags: ["白底图", "精修"] },
    { id: "product-video", name: "AI 生成产品视频", category: "电商", mode: "video", summary: "从产品素材生成具有商业镜头感的短视频。", description: "支持产品展示、镜头运动、材质特写和广告氛围。", referenceLabels: ["产品参考图"], promptPlaceholder: "描述运镜、动作、时长感和画面氛围", promptPrefix: "生成商业产品展示视频，产品外观必须稳定一致，镜头运动顺滑，光影真实。", tags: ["图生视频", "广告视频"] },
    { id: "hero-image", name: "主图生成", category: "电商", mode: "image", summary: "面向电商平台生成清晰聚焦的高转化主图。", description: "突出商品卖点，兼顾留白、构图和平台视觉规范。", referenceLabels: ["商品图"], promptPlaceholder: "描述目标平台、核心卖点和视觉要求", promptPrefix: "生成高转化电商主图，商品为唯一视觉主体，外观准确，构图清晰，保留可用文案留白。", tags: ["电商主图", "转化"] },
    { id: "ecommerce-key-visual", name: "生成电商主图", category: "电商", mode: "image", summary: "融合商品信息与营销语境，制作完整主视觉。", description: "适合活动页、详情页首屏和多平台营销素材。", referenceLabels: ["商品图", "品牌或风格参考（可选）"], promptPlaceholder: "输入平台、受众、主题、卖点和文案方向", promptPrefix: "生成完整的电商营销主视觉，准确还原商品，并将营销主题转译为可信的商业场景。", tags: ["营销视觉", "多平台"] },
    { id: "scene-builder", name: "场景图生成", category: "电商", mode: "image", summary: "将产品自然放入匹配卖点的商业场景。", description: "自动匹配空间、道具、透视、材质与环境光。", referenceLabels: ["产品图"], promptPlaceholder: "描述使用场景、季节、空间和情绪", promptPrefix: "为商品生成真实商业场景，严格保持商品外观，确保接触关系、透视和环境光一致。", tags: ["商品场景", "空间"] },
    { id: "photo-lab", name: "摄影实验室", category: "电商", mode: "image", summary: "用镜头、布光与胶片语言批量探索摄影方案。", description: "快速测试棚拍、人像、静物与户外摄影风格。", referenceLabels: ["拍摄主体"], promptPlaceholder: "描述镜头、焦段、布光、布景和色彩", promptPrefix: "以专业商业摄影标准拍摄参考主体，准确执行指定镜头、布光和色彩方案。", tags: ["摄影", "布光"] },
    { id: "style-replica", name: "风格复刻", category: "电商", mode: "image", summary: "提取参考图视觉语言，迁移到新的商品画面。", description: "复刻构图、光影、色彩与材质表达，不复制原主体。", referenceLabels: ["目标商品图", "风格参考图"], promptPlaceholder: "说明需要保留或排除的风格元素", promptPrefix: "保持第一张图商品准确，将第二张图的构图语言、色彩、光影和材质氛围迁移到新画面，不复制参考图主体。", tags: ["风格迁移", "视觉统一"] },
    { id: "virtual-model", name: "生成虚拟模特", category: "时尚与模特", mode: "image", summary: "根据服装与人设生成稳定的商业虚拟模特。", description: "可定义年龄、气质、地区特征、妆发与拍摄方式。", referenceLabels: ["服装或人物参考（可选）"], promptPlaceholder: "描述模特人设、妆发、动作和拍摄风格", promptPrefix: "生成成年商业时装模特，人物真实自然，服装结构准确，肤质与光影符合专业摄影。", tags: ["虚拟模特", "人像"] },
    { id: "universal-try-on", name: "万物上身", category: "时尚与模特", mode: "image", summary: "把服装或配饰自然穿戴到人物身上。", description: "兼顾人体结构、遮挡关系、褶皱与材质表现。", referenceLabels: ["人物图", "服装或配饰图"], promptPlaceholder: "补充穿戴位置、搭配和造型要求", promptPrefix: "让第一张图人物自然穿戴第二张图商品，准确还原商品版型、图案、颜色和材质，人体结构与遮挡关系合理。", tags: ["穿戴", "合成"] },
    { id: "product-try-on", name: "单品试穿", category: "时尚与模特", mode: "image", summary: "面向单件服装完成高还原度试穿。", description: "重点保持款式、剪裁、长度、图案和面料质感。", referenceLabels: ["模特图", "单品图"], promptPlaceholder: "说明搭配、版型和需要保留的人物特征", promptPrefix: "将第二张图单品试穿到第一张图模特，服装还原优先级最高，保持人物身份、姿态和背景。", tags: ["试穿", "服装"] },
    { id: "model-transfer", name: "模特迁移", category: "时尚与模特", mode: "image", summary: "把服装造型迁移到另一位模特并保持商品一致。", description: "用于更换模特人设、市场和形象表达。", referenceLabels: ["服装造型图", "目标模特图"], promptPlaceholder: "补充需保留的妆发、动作或背景", promptPrefix: "将第一张图的完整服装造型迁移到第二张图模特，保持目标模特身份，并严格还原服装。", tags: ["模特迁移", "造型"] },
    { id: "face-swap", name: "模特换脸", category: "时尚与模特", mode: "image", summary: "替换人物面部身份并维持原图摄影质感。", description: "保留姿态、服装、发型、构图和现场光线。", referenceLabels: ["原模特图", "目标人脸参考"], promptPlaceholder: "说明需要保留的人物和妆容细节", promptPrefix: "仅将第一张图人物面部身份替换为第二张图人物，保持原图姿态、服装、发型、构图和光线，融合自然。", tags: ["换脸", "人像"] },
    { id: "pose-fission", name: "模特姿势裂变", category: "时尚与模特", mode: "image", summary: "保持人物与服装一致，生成新的自然姿态。", description: "为同一套造型扩展多角度、多动作的拍摄素材。", referenceLabels: ["模特原图", "姿势参考（可选）"], promptPlaceholder: "描述目标姿势、机位和动作幅度", promptPrefix: "保持模特身份、服装和场景一致，生成自然可信的新姿势；如有第二张图则参考其姿态。", tags: ["姿势", "裂变"] },
    { id: "scene-fission", name: "模特场景图裂变", category: "时尚与模特", mode: "image", summary: "保持模特造型稳定，批量扩展不同拍摄场景。", description: "适合系列图、社媒素材和跨场景投放。", referenceLabels: ["模特原图", "场景参考（可选）"], promptPlaceholder: "描述目标地点、时间、天气和镜头语言", promptPrefix: "保持模特身份、服装和造型稳定，将人物自然置于新场景，统一透视、光影和色彩。", tags: ["场景裂变", "系列图"] },
    { id: "angle-control", name: "模特角度控制", category: "时尚与模特", mode: "image", summary: "控制人物与镜头角度，补齐商品展示视角。", description: "支持正面、侧面、背面、俯拍与低机位等方向。", referenceLabels: ["模特原图"], promptPlaceholder: "输入目标角度，例如背面全身、左侧 45°", promptPrefix: "保持人物身份、服装和场景一致，仅改变为用户指定的相机与身体角度，结构真实。", tags: ["视角", "机位"] },
    { id: "detail-restore", name: "模特原图贴回", category: "时尚与模特", mode: "image", summary: "将原图关键细节还原到生成结果中。", description: "用于恢复脸部、服装纹理、Logo 与局部商品细节。", referenceLabels: ["待修复生成图", "原始细节图"], promptPlaceholder: "说明需要贴回的区域与融合边界", promptPrefix: "将第二张图的指定原始细节准确贴回第一张图，保持其余生成内容不变，边缘与光影自然融合。", tags: ["细节恢复", "修复"] },
    { id: "outfit-extract", name: "搭配提取", category: "时尚与模特", mode: "image", summary: "从人物图中识别并提取完整穿搭组合。", description: "生成清晰的单品陈列，便于选品与搭配复用。", referenceLabels: ["穿搭人物图"], promptPlaceholder: "说明需要提取的品类和陈列方式", promptPrefix: "提取参考人物的完整穿搭单品，以整洁的商品陈列方式展示，准确保持每件单品颜色、版型和材质。", tags: ["搭配", "提取"] },
    { id: "outfit-breakdown", name: "一键分离模特穿搭", category: "时尚与模特", mode: "image", summary: "将模特造型拆分为独立可用的服饰单品。", description: "自动分离上装、下装、鞋履、包袋和配饰。", referenceLabels: ["模特穿搭图"], promptPlaceholder: "补充拆分品类、背景和排版要求", promptPrefix: "将参考图中的模特穿搭拆分为独立单品，按品类整齐排列在纯净背景上，细节清晰且互不遮挡。", tags: ["服装拆分", "单品"] },
    { id: "hd-upscale", name: "高清放大", category: "实用工具", mode: "image", summary: "提升清晰度与纹理，修复低分辨率素材。", description: "保留主体结构和真实纹理，减少噪点与压缩痕迹。", referenceLabels: ["待放大图片"], promptPlaceholder: "补充希望增强或避免改变的细节", promptPrefix: "对参考图进行高质量超分辨率修复，提升真实细节与边缘清晰度，不改变构图、人物身份、文字和商品外观。", tags: ["放大", "修复"] },
    { id: "ratio-guide", name: "比例查询", category: "实用工具", mode: "utility", summary: "快速查询常用平台画面比例与推荐尺寸。", description: "无需消耗模型额度，可直接复制适合电商、社媒和视频平台的尺寸。", referenceLabels: [], promptPlaceholder: "", promptPrefix: "", tags: ["尺寸", "平台规范"] },
];

export function getAiApplication(id?: string) {
    return AI_APPLICATIONS.find((app) => app.id === id);
}
