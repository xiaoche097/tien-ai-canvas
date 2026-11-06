import { http } from "./request";

export type AutoPartsSeatingLayout = { id: string; cabin: string; label: string; front: string; rear: string; console: string; trims: string[]; sourceUrl: string; note: string };
export type AutoPartsVehicleConfiguration = { market: string; marketLabel: string; year: string; yearLabel: string; driveSide: "left" | "right"; trims: string[]; sourceUrl: string; checkedOn: string; generation: string; catalogNote: string; seating: AutoPartsSeatingLayout[] };
export type AutoPartsVehicle = { id: string; make: string; model: string; body: string; markets: string[]; sourceUrl: string; previewCell: number; configurations: AutoPartsVehicleConfiguration[] };
export type AutoPartsIntent = { vehicleId: string; market: string; year: string; configuration: string; driveSide: "left" | "right"; productType: "seat-cover" | "armrest-cover" | "floor-mat"; productCount: number; brand: "neutral" | "RIDEPOSH" | "FNINEPRO" | "FREESOO"; scene: "installation" | "detail" | "lifestyle"; description: string; confirmed: boolean; cabin: string; seatingId: string };

export function listAutoPartsVehicles(signal?: AbortSignal) {
    return http.get<{ vehicles: AutoPartsVehicle[] }>("/auto-parts/vehicles", { signal });
}
