export type CreationShowcaseMedia = {
    id: string;
    title: string;
    poster: string;
    videoSrc?: string;
    playbackRate?: number;
};

// Keep the media slots separate from the layout so supplied videos only replace
// their source and poster, without changing the scrolling composition.
export const creationShowcaseHero: CreationShowcaseMedia = {
    id: "hero",
    title: "XCSTUDIO · 境彻机甲英雄",
    poster: "assets/showcase/hero-poster.bd53af28598c.jpg",
    videoSrc: "assets/showcase/hero-video.a6b9e1addb3d.mp4",
    playbackRate: 0.4,
};

export const creationShowcaseColumns: CreationShowcaseMedia[][] = [
    [
        { id: "outfit", title: "穿搭反转", poster: "assets/showcase/outfit-poster.cc1cb6e71b47.jpg", videoSrc: "assets/showcase/outfit-video.d16f033a6074.mp4" },
        { id: "missair", title: "商业广告", poster: "assets/showcase/missair-poster.e75bfad67bad.jpg", videoSrc: "assets/showcase/missair-video.01a3199f7249.mp4" },
    ],
    [
        { id: "pink-knit", title: "UGC 种草", poster: "assets/showcase/pink-knit-poster.85543b95d29a.jpg", videoSrc: "assets/showcase/pink-knit-video.e3b25195799e.mp4" },
        { id: "visual-02", title: "商品细节", poster: "assets/showcase/visual-02-poster.42b95133f3fc.jpg", videoSrc: "assets/showcase/visual-02-video.cb8ab26f7546.mp4" },
    ],
    [
        { id: "visual-01", title: "日常穿搭", poster: "assets/showcase/visual-01-poster.83c187fe48c3.jpg", videoSrc: "assets/showcase/visual-01-video.9c27cb947e04.mp4" },
        { id: "edit", title: "开箱种草", poster: "assets/showcase/edit-poster.a9f6376c8b97.jpg", videoSrc: "assets/showcase/edit-video.76513101be9d.mp4" },
    ],
];
