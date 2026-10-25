// Generated locally for protocol acceptance; this is a flattened test image.
export async function createSample(): Promise<ArrayBuffer> {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1100;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持测试图像生成。");
    const styles = getComputedStyle(document.documentElement);
    ctx.fillStyle = styles.getPropertyValue("--background").trim();
    ctx.fillRect(0, 0, 900, 1100);
    ctx.fillStyle = styles.getPropertyValue("--foreground").trim();
    ctx.font = "bold 76px sans-serif";
    ctx.fillText("留白，也有分量。", 64, 380);
    ctx.font = "28px sans-serif";
    ctx.fillText("境彻 / 电商设计室", 64, 460);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.strokeRect(64, 540, 772, 360);
    ctx.font = "22px sans-serif";
    ctx.fillText("PNG 位图样本 · 可在编辑器中添加真实文字图层", 96, 730);
    ctx.fillText("900 × 1100 / PHASE 0", 64, 1010);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("测试图像生成失败。")), "image/png"));
    return blob.arrayBuffer();
}
