import { Clapperboard, Megaphone, Shapes, ShoppingBag, UserRound, type LucideIcon } from "lucide-react";

export type CreativeApplication = {
    id: string;
    title: string;
    category: string;
    description: string;
    icon: LucideIcon;
    video?: string;
    placeholder: string;
    instructions: string;
};

export const creativeApplications: CreativeApplication[] = [
    {
        id: "character-studio",
        title: "角色创作工作室",
        category: "影视创意",
        icon: UserRound,
        video: "/creative-center/character-studio.mp4",
        description: "从人物设定出发，整理角色档案、造型与参考画面，让角色在不同镜头中保持一致。",
        placeholder: "描述角色的身份、性格、造型与画风，也可以进入画布后添加参考图。",
        instructions: "作为角色创作工作室，围绕用户的角色概念整理人物档案、外貌与服装设定、参考画面及一致性约束。先澄清必要信息，再提出可在画布执行的创作计划；使用用户配置的模型与素材，生成与修改沿用现有审批流程。",
    },
    {
        id: "commerce-studio",
        title: "电商设计室",
        category: "电商广告",
        icon: ShoppingBag,
        video: "/creative-center/commerce-studio.mp4",
        description: "围绕商品与卖点，策划主图、场景图和短视频广告，建立一组连贯的商品视觉。",
        placeholder: "商品是什么？面向谁？描述核心卖点、品牌风格和需要的素材，参考商品图可在画布上传。",
        instructions: "作为电商设计室，围绕商品信息、目标受众、核心卖点与品牌风格规划商品主图、场景图和短视频广告。先确认素材与交付要求，不编造商品功效；保持商品外观一致，使用用户配置的模型，在原有审批流程下执行。",
    },
    {
        id: "social-studio",
        title: "社媒素材工作室",
        category: "社媒内容",
        icon: Megaphone,
        video: "/creative-center/social-studio.mp4",
        description: "从一个主题出发，规划社媒文案、配图与短视频，把想法整理为适合发布的内容。",
        placeholder: "想在哪个平台发布？告诉我主题、受众、语气以及需要的文案、图片或视频。",
        instructions: "作为社媒素材工作室，先确认发布平台、主题、受众与表达风格，再规划文案、配图、视频脚本及可执行分镜。针对平台画幅和节奏给出素材方案，保持内容一致；使用用户配置的模型，生成操作沿用现有审批流程。",
    },
    {
        id: "creative-studio",
        title: "创意工作室",
        category: "创意设计",
        icon: Shapes,
        video: "/creative-center/creative-studio.mp4",
        description: "把灵感拆成可执行的视觉方案，连接文字、图像与视频，在画布里逐步完成创作。",
        placeholder: "描述你的想法、期望的视觉效果和最终交付形式，我们从创作方案开始。",
        instructions: "作为创意工作室，将用户的灵感拆解为创作目标、视觉方向、素材需求和画布执行步骤。先确认目标与限制，再规划文字、图像或视频方案；只使用用户实际可用的模型与工具，不承诺尚未实现的功能，沿用现有生成审批流程。",
    },
    {
        id: "short-drama",
        title: "短剧创作",
        category: "影视创意",
        icon: Clapperboard,
        description: "从一句话、小说或剧本开始，生成章节并管理角色、分镜、画布与制作进度。",
        placeholder: "",
        instructions: "",
    },
];
