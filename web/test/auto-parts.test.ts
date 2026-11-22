import { expect, test } from "bun:test";
import { autoPartsInputError, autoPartsVehicleSelection, filterAutoPartsVehicles } from "../src/pages/auto-parts-center/workflow";
import type { AutoPartsIntent, AutoPartsVehicle, AutoPartsVehicleConfiguration } from "../src/services/api/auto-parts";
import catalog from "../../backend/internal/prompts/auto_parts/vehicle-configurations.json";

const vehicles: AutoPartsVehicle[] = [
{ id: "ford-f150", make: "Ford", model: "F-150", body: "pickup", markets: ["US"], sourceUrl: "https://www.ford.com/trucks/f150/", previewCell: 0, configurations: catalog["ford-f150"] as AutoPartsVehicleConfiguration[] },
    { id: "volkswagen-golf", make: "Volkswagen", model: "Golf", body: "hatchback", markets: ["EU", "UK"], sourceUrl: "https://www.volkswagen.co.uk/en/new/golf.html", previewCell: 5, configurations: catalog["volkswagen-golf"] as AutoPartsVehicleConfiguration[] },
];

test("车型筛选组合市场、车身与名称，不把品牌来源当销售市场", () => {
    expect(filterAutoPartsVehicles(vehicles, " F-150 ", "all", "US").map((v) => v.id)).toEqual(["ford-f150"]);
    expect(filterAutoPartsVehicles(vehicles, "", "pickup", "EU")).toHaveLength(0);
    expect(filterAutoPartsVehicles(vehicles, "golf", "hatchback", "UK").map((v) => v.id)).toEqual(["volkswagen-golf"]);
});

test("缺年款、配置、产品、实车图或用户确认时禁止生成", () => {
    const intent: AutoPartsIntent = { vehicleId: "ford-f150", market: "US", year: "2026", configuration: "XLT", cabin: "SuperCrew · 全尺寸双排", seatingId: "crew-bench", driveSide: "left", productType: "seat-cover", productCount: 2, brand: "neutral", scene: "installation", description: "", confirmed: true };
    expect(autoPartsInputError(intent, 1, vehicles[0])).toBe("");
    for (const patch of [{ year: "2014" }, { cabin: "Regular Cab · 单排" }, { seatingId: "five" }, { seatingId: "" }, { configuration: "High Country" }, { driveSide: "right" as const }, { configuration: " " }, { productCount: 0 }, { productCount: 5 }, { confirmed: false }]) expect(autoPartsInputError({ ...intent, ...patch }, 1, vehicles[0])).not.toBe("");
    for (const count of [0, 2]) expect(autoPartsInputError(intent, count, vehicles[0])).toContain("1 张对应车型");
});

test("切换市场或年款清空旧配置并联动实际驾驶位，未收录年份不兜底", () => {
    expect(autoPartsVehicleSelection(vehicles[0], "US")).toEqual({ market: "US", year: "2026", configuration: "", cabin: "", seatingId: "", driveSide: "left" });
    expect(autoPartsVehicleSelection(vehicles[1], "UK")).toEqual({ market: "UK", year: "current", configuration: "", cabin: "", seatingId: "", driveSide: "right" });
    expect(autoPartsVehicleSelection(vehicles[0], "US", "2014").year).toBe("");
});
