package prompts

import (
	"strings"
	"testing"
)

func bagIntentFixture() TryOnIntent {
	return TryOnIntent{Tool: "bag", ProductCount: 2, ReferenceMode: "reference", GenerationMode: "professional", Bag: &TryOnBag{Type: "backpack", AgeGroup: "adult", Views: []TryOnBagView{{Source: "flat", Angle: "front"}, {Source: "mannequin", Angle: "back"}}}}
}

func TestTryOnBagReferenceRolesAndNaturalPresentation(t *testing.T) {
	for kind := range tryOnBagInstructions {
		intent := bagIntentFixture()
		intent.Bag.Type = kind
		if err := intent.Validate(3); err != nil {
			t.Fatal(err)
		}
		context := tryOnProtectedContext("try_on_bag", intent.Values())
		for _, phrase := range []string{"图 1：平铺商品图", "图 2：人台展示图", "图 3", "同一款包", "成人", "接触阴影", "不夸张鼓胀", "不左右镜像标志", "保留", tryOnBagInstructions[kind]} {
			if !strings.Contains(context, phrase) {
				t.Fatalf("missing bag constraint: %s", phrase)
			}
		}
	}
	intent := bagIntentFixture()
	intent.Bag.AgeGroup, intent.GenerationMode = "child", "children"
	if err := intent.Validate(3); err != nil {
		t.Fatal(err)
	}
	mode := intent.Values()["执行模式"]
	if !strings.Contains(mode, "儿童包袋") || !strings.Contains(mode, "不成人化") || strings.Contains(mode, "内衣") {
		t.Fatal("incorrect child bag mode")
	}
}

func TestTryOnBagRejectsInvalidSourcesAndCrossToolParameters(t *testing.T) {
	for _, change := range []func(*TryOnIntent){
		func(i *TryOnIntent) { i.Bag = nil },
		func(i *TryOnIntent) { i.ReferenceMode = "smart" },
		func(i *TryOnIntent) { i.Bag.Type = "unknown" },
		func(i *TryOnIntent) { i.Bag.AgeGroup = "unknown" },
		func(i *TryOnIntent) { i.Bag.AgeGroup = "child" },
		func(i *TryOnIntent) { i.Bag.Views = i.Bag.Views[:1] },
		func(i *TryOnIntent) { i.Bag.Views[0].Source = "model" },
		func(i *TryOnIntent) { i.Bag.Views[0].Angle = "auto,front" },
		func(i *TryOnIntent) { i.Bag.Views[0].Angle = "" },
		func(i *TryOnIntent) {
			for j := range i.Bag.Views {
				i.Bag.Views[j].Angle = "detail"
			}
		},
		func(i *TryOnIntent) { i.Tool = "outfit" },
	} {
		intent := bagIntentFixture()
		change(&intent)
		if intent.Validate(3) == nil {
			t.Fatal("accepted invalid bag contract")
		}
	}
	intent := bagIntentFixture()
	if intent.Validate(4) == nil {
		t.Fatal("accepted undeclared target model")
	}
	intent.ProductCount = 5
	intent.Bag.Views = []TryOnBagView{}
	for range 5 {
		intent.Bag.Views = append(intent.Bag.Views, TryOnBagView{Source: "flat", Angle: "auto"})
	}
	if intent.Validate(6) == nil {
		t.Fatal("accepted more than four flat references")
	}
}
