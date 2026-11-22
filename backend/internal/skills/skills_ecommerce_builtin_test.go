package skills

import (
	"bytes"
	"testing"

	"yingce/backend/internal/model"
)

func TestEcommerceBuiltinMarketInstallAndRead(t *testing.T) {
	svc, db := newSkillLibraryCategoryTestService(t)
	if err := db.AutoMigrate(&model.SkillVersion{}, &model.SkillFile{}, &model.BuiltinSkillTombstone{}); err != nil {
		t.Fatal(err)
	}
	if err := svc.EnsureBuiltinSkills(); err != nil {
		t.Fatal(err)
	}
	const id = "ecommerce-detail-studio"
	market, err := svc.Skills("buyer", SkillListRequest{Search: "电商详情图生成", Tag: "ecommerce"})
	if err != nil {
		t.Fatal(err)
	}
	if market.TotalCount != 1 || len(market.Skills) != 1 || market.Skills[0].SkillID != id {
		t.Fatalf("market search did not return the ecommerce skill: %#v", market)
	}
	if market.Skills[0].IsAdded || market.Skills[0].FileCount != 4 {
		t.Fatal("new builtin must be a complete package and must not auto-install")
	}
	installed, err := svc.SetSkillAdded("buyer", id, true)
	if err != nil {
		t.Fatal(err)
	}
	if !installed.IsAdded || installed.VersionID == "" {
		t.Fatal("installation did not pin a real package version")
	}
	for _, path := range []string{"SKILL.md", "cards/product-analysis.md", "cards/module-planning.md", "cards/generation-quality.md"} {
		body, _, _, err := svc.SkillPackageRawFile("buyer", id, path)
		if err != nil || len(bytes.TrimSpace(body)) == 0 {
			t.Fatalf("installed package file %s is unavailable: %v", path, err)
		}
	}
	if err := svc.EnsureBuiltinSkills(); err != nil {
		t.Fatal(err)
	}
	for _, user := range []string{"buyer", "other-buyer"} {
		added, err := svc.AddedSkills(user)
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, skill := range added {
			if skill.SkillID == id {
				found = true
				if skill.VersionID != installed.VersionID {
					t.Fatal("catalog resync unexpectedly changed installed version")
				}
			}
		}
		if found != (user == "buyer") {
			t.Fatalf("installation state leaked or was lost for %s", user)
		}
	}
}
