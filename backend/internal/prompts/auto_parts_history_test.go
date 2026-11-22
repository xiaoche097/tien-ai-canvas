package prompts

import (
	"strconv"
	"strings"
	"testing"
)

func TestAutoPartsHistoricalSeatsAreScopedToAllSixVehicles(t *testing.T) {
	vehicles := AutoPartsVehicles()
	if len(vehicles) != 6 {
		t.Fatal("expected six catalog vehicles")
	}
	for _, vehicle := range vehicles {
		for _, market := range vehicle.Markets {
			start := 2015
			if vehicle.ID == "tesla-model-y" {
				start = map[string]int{"US": 2020, "EU": 2021, "UK": 2022}[market]
			}
			for year := start; year <= 2026; year++ {
				if vehicle.ID == "tesla-model-y" && year == 2026 {
					continue
				}
				// Current Tesla pages do not state a model year; historical rows use a reference year.
				found := false
				for _, row := range vehicle.Configurations {
					if row.Market == market && row.Year == strconv.Itoa(year) {
						found = true
					}
				}
				if !found {
					t.Fatalf("missing reference year: %s %s %d", vehicle.ID, market, year)
				}
			}
		}
		for _, row := range vehicle.Configurations {
			for _, trim := range row.Trims {
				found := false
				for _, seat := range row.Seating {
					if seat.Front == "" || seat.Rear == "" || seat.Console == "" || seat.SourceURL == "" || seat.Note == "" {
						t.Fatal("missing seat details")
					}
					if _, ok := row.SeatingLayout(trim, seat.Cabin, seat.ID); !ok {
						continue
					}
					found = true
					intent := validAutoPartsIntent()
					intent.VehicleID, intent.Market, intent.Year, intent.Configuration, intent.DriveSide = vehicle.ID, row.Market, row.Year, trim, row.DriveSide
					intent.Cabin, intent.SeatingID = seat.Cabin, seat.ID
					if err := intent.Validate(3); err != nil {
						t.Fatalf("rejected catalog combination: %s %s %s %s: %v", vehicle.ID, row.Year, trim, seat.ID, err)
					}
					if seat.ID == "m-carbon" && (!strings.Contains(trim, "M3") || row.Year < "2021") {
						t.Fatal("carbon seats leaked to incompatible model/year")
					}
					if vehicle.ID == "tesla-model-y" && seat.ID == "seven" && (row.Year == "2020" || strings.Contains(trim, "Performance")) {
						t.Fatal("invalid seven-seat option")
					}
					if strings.HasPrefix(seat.ID, "regular-") && seat.Rear != "无后排" {
						t.Fatal("single-row cab has rear seats")
					}
				}
				if !found {
					t.Fatalf("trim has no selectable seats: %s %s %s", vehicle.ID, row.Year, trim)
				}
			}
		}
	}
}
