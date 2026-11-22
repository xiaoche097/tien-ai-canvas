package prompts

import (
	"strings"
	"testing"
)

func validAutoPartsIntent() AutoPartsIntent {
	return AutoPartsIntent{VehicleID: "ford-f150", Market: "US", Year: "2026", Configuration: "XLT", Cabin: "SuperCrew · 全尺寸双排", SeatingID: "crew-bench", DriveSide: "left", ProductType: "seat-cover", ProductCount: 2, Brand: "RIDEPOSH", Scene: "installation", Confirmed: true}
}

func TestAutoPartsValidationAndProtectedKnowledge(t *testing.T) {
	intent := validAutoPartsIntent()
	if err := intent.Validate(3); err != nil {
		t.Fatal(err)
	}
	definition, ok := PromptDefinition(AutoPartsOperation)
	if !ok {
		t.Fatal("auto parts missing from template catalog")
	}
	if err := validatePromptPlaceholders(definition, definition.DefaultContent); err != nil {
		t.Fatal(err)
	}
	values := intent.Values()
	context := protectedPromptContext(AutoPartsOperation, values)
	for _, phrase := range []string{"图 1～2", "图 3", "默认沿用实车图", "不证明", "不自动评分", "取消把", "RIDEPOSH", "用户提供"} {
		if !strings.Contains(context, phrase) {
			t.Fatalf("missing knowledge constraint: %s", phrase)
		}
	}
	if strings.Contains(values["品牌风格"], "FNINEPRO") || strings.Contains(values["品牌风格"], "FREESOO") {
		t.Fatal("mixed brand styles")
	}
	for _, brand := range []string{"neutral", "RIDEPOSH", "FNINEPRO", "FREESOO"} {
		intent.Brand = brand
		if intent.Values()["品牌风格"] == "" {
			t.Fatal("missing brand style")
		}
	}
}

func TestAutoPartsRejectsUnconfirmedAndInvalidInputs(t *testing.T) {
	for _, change := range []func(*AutoPartsIntent){
		func(i *AutoPartsIntent) { i.VehicleID = "unknown" },
		func(i *AutoPartsIntent) { i.Market = "EU" },
		func(i *AutoPartsIntent) { i.Year = "2024-2026" },
		func(i *AutoPartsIntent) { i.Year = "2014" },
		func(i *AutoPartsIntent) { i.SeatingID = "five" },
		func(i *AutoPartsIntent) { i.Cabin = "Regular Cab · 单排" },
		func(i *AutoPartsIntent) { i.Configuration = " " },
		func(i *AutoPartsIntent) { i.Configuration = "High Country" },
		func(i *AutoPartsIntent) { i.DriveSide = "right" },
		func(i *AutoPartsIntent) { i.DriveSide = "unknown" },
		func(i *AutoPartsIntent) { i.ProductType = "unknown" },
		func(i *AutoPartsIntent) { i.Brand = "unknown" },
		func(i *AutoPartsIntent) { i.Scene = "unknown" },
		func(i *AutoPartsIntent) { i.ProductCount = 0 },
		func(i *AutoPartsIntent) { i.ProductCount = 5 },
		func(i *AutoPartsIntent) { i.Confirmed = false },
	} {
		intent := validAutoPartsIntent()
		change(&intent)
		if intent.Validate(3) == nil {
			t.Fatal("accepted invalid auto-parts input")
		}
	}
	intent := validAutoPartsIntent()
	if intent.Validate(2) == nil || intent.Validate(4) == nil {
		t.Fatal("accepted incorrect interior reference count")
	}
}

func TestAutoPartsConfigurationCatalogIsCompleteAndMarketScoped(t *testing.T) {
	for _, vehicle := range AutoPartsVehicles() {
		for _, market := range vehicle.Markets {
			found := false
			seen := map[string]bool{}
			for _, row := range vehicle.Configurations {
				if row.Market != market {
					continue
				}
				found = true
				if seen[row.Year] || len(row.Trims) == 0 || row.SourceURL == "" || row.CheckedOn == "" || row.MarketLabel == "" || row.YearLabel == "" {
					t.Fatalf("invalid catalog entry for %s %s", vehicle.ID, market)
				}
				seen[row.Year] = true
				intent := validAutoPartsIntent()
				intent.VehicleID, intent.Market, intent.Year, intent.Configuration, intent.DriveSide = vehicle.ID, market, row.Year, row.Trims[0], row.DriveSide
				if len(row.Seating) == 0 || row.Generation == "" || row.CatalogNote == "" {
					t.Fatalf("missing seating provenance: %s %s", vehicle.ID, row.Year)
				}
				for _, layout := range row.Seating {
					for _, trim := range layout.Trims {
						if trim == intent.Configuration {
							intent.Cabin, intent.SeatingID = layout.Cabin, layout.ID
						}
					}
				}
				if err := intent.Validate(3); err != nil {
					t.Fatal(err)
				}
				if market == "UK" && row.DriveSide != "right" || market != "UK" && row.DriveSide != "left" {
					t.Fatal("market steering mismatch")
				}
			}
			if !found {
				t.Fatalf("missing market configuration: %s %s", vehicle.ID, market)
			}
		}
	}
	intent := validAutoPartsIntent()
	intent.VehicleID, intent.Market, intent.Year, intent.Configuration, intent.DriveSide = "tesla-model-y", "UK", "current", "Rear-Wheel Drive", "right"
	intent.Cabin, intent.SeatingID = "五座 SUV", "five"
	if err := intent.Validate(3); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(intent.Values()["创作参数"], "未标车型年") {
		t.Fatal("current catalog interpreted as a numeric model year")
	}
}
