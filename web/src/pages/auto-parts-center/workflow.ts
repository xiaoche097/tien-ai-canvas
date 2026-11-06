import type { AutoPartsIntent, AutoPartsVehicle, AutoPartsVehicleConfiguration } from "@/services/api/auto-parts";
import type { ReferenceImage } from "@/types/image";

export const marketLabels: Record<string, string> = { US: "美国市场", EU: "欧洲大陆", UK: "英国市场" };
export const bodyLabels: Record<string, string> = { pickup: "皮卡", suv: "SUV", sedan: "轿车", hatchback: "两厢车" };
export const productLabels = { "seat-cover": "座椅套", "armrest-cover": "扶手箱套", "floor-mat": "汽车脚垫" };
export const sceneLabels = { installation: "实车安装效果", detail: "可见细节特写", lifestyle: "场景副图" };

export function filterAutoPartsVehicles(vehicles: AutoPartsVehicle[], search: string, body: string, market: string) {
    return vehicles.filter((vehicle) => (body === "all" || vehicle.body === body) && (market === "all" || vehicle.markets.includes(market)) && `${vehicle.make} ${vehicle.model}`.toLowerCase().includes(search.trim().toLowerCase()));
}

export function autoPartsConfiguration(vehicle: AutoPartsVehicle, market: string, year: string) {
    return vehicle.configurations.find((item) => item.market === market && item.year === year);
}

export function autoPartsVehicleSelection(vehicle: AutoPartsVehicle, market: string, year?: string) {
    const configuration = vehicle.configurations.find((item) => item.market === market && (!year || item.year === year));
    return { market, year: configuration?.year || "", configuration: "", cabin: "", seatingId: "", driveSide: configuration?.driveSide || "left" as const };
}

export function autoPartsSeatingOptions(configuration: AutoPartsVehicleConfiguration | undefined, trim: string, cabin?: string) {
    return (configuration?.seating || []).filter((layout) => layout.trims.includes(trim) && (!cabin || layout.cabin === cabin));
}

export function autoPartsInputError(intent: AutoPartsIntent, interiorCount: number, vehicle: AutoPartsVehicle) {
    const configuration = autoPartsConfiguration(vehicle, intent.market, intent.year);
    if (!configuration) return "请选择当前车型与市场已收录的年款";
    if (!configuration.trims.includes(intent.configuration)) return "请选择当前年款的车型型号配置";
    if (configuration.driveSide !== intent.driveSide) return "驾驶位与当前车型市场配置不符";
    if (!autoPartsSeatingOptions(configuration, intent.configuration, intent.cabin).some((layout) => layout.id === intent.seatingId && layout.cabin === intent.cabin)) return "请选择对应驾驶室及实车座椅结构";
    if (intent.productCount < 1 || intent.productCount > 4) return "请上传 1～4 张同一款产品图";
    if (interiorCount !== 1) return "请上传 1 张对应车型的真实内饰参考图";
    if (!intent.confirmed) return "请确认年款、配置及参考图属于本次目标车辆";
    return "";
}

export async function readAutoPartsImage(file: File): Promise<ReferenceImage> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("请选择 JPG、PNG 或 WEBP 图片");
    if (file.size > 20 * 1024 * 1024) throw new Error("每张图片最多 20MB");
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("图片读取失败")); reader.readAsDataURL(file); });
    const image = new Image(); image.src = dataUrl;
    try { await image.decode(); } catch { throw new Error("图片无法解码，请更换文件"); }
    if (Math.min(image.width, image.height) < 300 || Math.max(image.width, image.height) > 4096) throw new Error("图片每条边需在 300～4096px 之间");
    return { id: crypto.randomUUID(), name: file.name, dataUrl, type: file.type, width: image.width, height: image.height, bytes: file.size };
}
