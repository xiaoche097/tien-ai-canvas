"use client";

import { create } from "zustand";

interface BrandState {
  brandName: string;
  companyName: string;
  version: string;
  setBrandName: (name: string) => void;
  setCompanyName: (name: string) => void;
  setVersion: (version: string) => void;
}

const STORAGE_KEY = "bm_brand_config";
const DEFAULT_COMPANY_NAME = "境彻";
const DEFAULT_BRAND_NAME = "电商设计室";

function loadStoredBrand(): { brandName: string; companyName: string; version: string } {
  if (typeof window === "undefined") {
    return { brandName: DEFAULT_BRAND_NAME, companyName: DEFAULT_COMPANY_NAME, version: "V1" };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        brandName: process.env.NEXT_PUBLIC_CANVAS_INTEGRATION === "1" || parsed.brandName === "摹图" ? DEFAULT_BRAND_NAME : parsed.brandName || DEFAULT_BRAND_NAME,
        companyName: parsed.companyName === "零禾（上海）网络科技有限公司" ? DEFAULT_COMPANY_NAME : parsed.companyName || DEFAULT_COMPANY_NAME,
        version: parsed.version || "V1",
      };
    }
  } catch {
    // ignore
  }
  return { brandName: DEFAULT_BRAND_NAME, companyName: DEFAULT_COMPANY_NAME, version: "V1" };
}

function saveStoredBrand(state: { brandName: string; companyName: string; version: string }) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export const useBrandStore = create<BrandState>((set) => {
  const initial = loadStoredBrand();
  return {
    ...initial,
    setBrandName: (brandName) => {
      if (process.env.NEXT_PUBLIC_CANVAS_INTEGRATION === "1") return;
      set((state) => {
        const next = { ...state, brandName };
        saveStoredBrand(next);
        return next;
      });
    },
    setCompanyName: (companyName) => {
      set((state) => {
        const next = { ...state, companyName };
        saveStoredBrand(next);
        return next;
      });
    },
    setVersion: (version) => {
      set((state) => {
        const next = { ...state, version };
        saveStoredBrand(next);
        return next;
      });
    },
  };
});
