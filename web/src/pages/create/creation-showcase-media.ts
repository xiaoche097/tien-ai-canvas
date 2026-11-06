export type CreationShowcaseMedia = {
    id: string;
    title: string;
    poster: string;
    videoSrc?: string;
};

// Keep the media slots separate from the layout so supplied videos only replace
// their source and poster, without changing the scrolling composition.
export const creationShowcaseHero: CreationShowcaseMedia = {
    id: "hero",
    title: "下一幕，从这里开始",
    poster: "short-drama-styles/cyberpunk-neon.jpg",
};

export const creationShowcaseColumns: CreationShowcaseMedia[][] = [
    [
        { id: "city", title: "城市漫游", poster: "short-drama-styles/retro-hong-kong.jpg" },
        { id: "product", title: "商品广告", poster: "creative-center/commerce-studio.jpg" },
        { id: "nature", title: "自然叙事", poster: "short-drama-styles/nature-healing.jpg" },
    ],
    [
        { id: "cinema", title: "电影感短片", poster: "short-drama-styles/real-life.jpg" },
        { id: "fantasy", title: "奇想世界", poster: "short-drama-styles/fantasy-3d.jpg" },
        { id: "ink", title: "东方意境", poster: "short-drama-styles/ink-narrative.jpg" },
    ],
    [
        { id: "future", title: "未来片场", poster: "short-drama-styles/future-tech.jpg" },
        { id: "clay", title: "定格故事", poster: "short-drama-styles/clay-stop-motion.jpg" },
        { id: "comic", title: "漫画分镜", poster: "short-drama-styles/comic-pop.jpg" },
    ],
];
