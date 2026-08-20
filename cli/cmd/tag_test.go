package cmd

import (
	"encoding/json"
	"sort"
	"strings"
	"testing"
)

func tagFixtures() (current, projectTags []tag) {
	bug := tag{ID: "t-bug", Name: "Bug"}
	feature := tag{ID: "t-feature", Name: "Feature"}
	discuss := tag{ID: "t-discuss", Name: "Discuss"}
	lower := tag{ID: "t-bug-lower", Name: "bug"}
	return []tag{bug}, []tag{bug, feature, discuss, lower}
}

func assertIDs(t *testing.T, got []string, want ...string) {
	t.Helper()
	g := append([]string(nil), got...)
	w := append([]string(nil), want...)
	sort.Strings(g)
	sort.Strings(w)
	if strings.Join(g, ",") != strings.Join(w, ",") {
		t.Errorf("tag IDs = %v, want %v", got, want)
	}
}

func TestPlanTagChangeAdd(t *testing.T) {
	current, projectTags := tagFixtures()

	t.Run("keeps existing and appends a known tag", func(t *testing.T) {
		plan, err := planTagChange("add", current, projectTags, []string{"Feature"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		assertIDs(t, plan.KeepIDs, "t-bug", "t-feature")
		if len(plan.Create) != 0 {
			t.Errorf("Create = %v, want none", plan.Create)
		}
		if plan.Unchanged {
			t.Error("Unchanged = true, want false")
		}
	})

	t.Run("adds several at once", func(t *testing.T) {
		plan, err := planTagChange("add", current, projectTags, []string{"Feature", "Discuss"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		assertIDs(t, plan.KeepIDs, "t-bug", "t-feature", "t-discuss")
	})

	t.Run("queues an unknown name for creation", func(t *testing.T) {
		plan, err := planTagChange("add", current, projectTags, []string{"frontend", "Feature"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		assertIDs(t, plan.KeepIDs, "t-bug", "t-feature")
		if len(plan.Create) != 1 || plan.Create[0] != "frontend" {
			t.Errorf("Create = %v, want [frontend]", plan.Create)
		}
		if plan.Unchanged {
			t.Error("a tag to create is never Unchanged")
		}
	})

	t.Run("adding a tag the card already has is unchanged", func(t *testing.T) {
		plan, err := planTagChange("add", current, projectTags, []string{"Bug"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !plan.Unchanged {
			t.Error("Unchanged = false, want true")
		}
		assertIDs(t, plan.KeepIDs, "t-bug")
	})

	t.Run("matches names case-sensitively", func(t *testing.T) {
		// "bug" and "Bug" are separate project tags; adding "bug" to a card that
		// carries "Bug" must resolve to the lowercase tag, not no-op.
		plan, err := planTagChange("add", current, projectTags, []string{"bug"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		assertIDs(t, plan.KeepIDs, "t-bug", "t-bug-lower")
		if len(plan.Create) != 0 {
			t.Errorf("Create = %v, want none — %q exists in the project", plan.Create, "bug")
		}
	})

	t.Run("dedupes repeated names", func(t *testing.T) {
		plan, err := planTagChange("add", current, projectTags, []string{"Feature", "Feature"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		assertIDs(t, plan.KeepIDs, "t-bug", "t-feature")
	})

	t.Run("errors with no names", func(t *testing.T) {
		if _, err := planTagChange("add", current, projectTags, nil); err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestPlanTagChangeRemove(t *testing.T) {
	current, projectTags := tagFixtures()
	current = append(current, tag{ID: "t-feature", Name: "Feature"})

	t.Run("drops the named tag", func(t *testing.T) {
		plan, err := planTagChange("remove", current, projectTags, []string{"Feature"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		assertIDs(t, plan.KeepIDs, "t-bug")
		if plan.Unchanged {
			t.Error("Unchanged = true, want false")
		}
	})

	t.Run("removing every tag leaves an empty list", func(t *testing.T) {
		plan, err := planTagChange("remove", current, projectTags, []string{"Bug", "Feature"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(plan.KeepIDs) != 0 {
			t.Errorf("KeepIDs = %v, want empty", plan.KeepIDs)
		}
	})

	t.Run("errors on a tag that is not on the card", func(t *testing.T) {
		// Discuss exists in the project but not on this card — silently no-opping
		// would be indistinguishable from a successful removal.
		_, err := planTagChange("remove", current, projectTags, []string{"Discuss"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !strings.Contains(err.Error(), "Discuss") {
			t.Errorf("error should name the tag, got: %v", err)
		}
	})

	t.Run("errors on a name unknown to the project", func(t *testing.T) {
		if _, err := planTagChange("remove", current, projectTags, []string{"nope"}); err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("never creates a tag", func(t *testing.T) {
		_, err := planTagChange("remove", current, projectTags, []string{"brand-new"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestPlanTagChangeSet(t *testing.T) {
	current, projectTags := tagFixtures()

	t.Run("replaces the whole list", func(t *testing.T) {
		plan, err := planTagChange("set", current, projectTags, []string{"Feature", "Discuss"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		assertIDs(t, plan.KeepIDs, "t-feature", "t-discuss")
		if plan.Unchanged {
			t.Error("Unchanged = true, want false")
		}
	})

	t.Run("no names clears every tag", func(t *testing.T) {
		plan, err := planTagChange("set", current, projectTags, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(plan.KeepIDs) != 0 {
			t.Errorf("KeepIDs = %v, want empty", plan.KeepIDs)
		}
		if plan.Unchanged {
			t.Error("clearing a tagged card is a change")
		}
	})

	t.Run("clearing an untagged card is unchanged", func(t *testing.T) {
		plan, err := planTagChange("set", nil, projectTags, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !plan.Unchanged {
			t.Error("Unchanged = false, want true")
		}
	})

	t.Run("setting the same list is unchanged whatever the order", func(t *testing.T) {
		current := []tag{{ID: "t-bug", Name: "Bug"}, {ID: "t-feature", Name: "Feature"}}
		plan, err := planTagChange("set", current, projectTags, []string{"Feature", "Bug"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !plan.Unchanged {
			t.Error("Unchanged = false — the card's tag list has no order")
		}
	})

	t.Run("queues unknown names for creation", func(t *testing.T) {
		plan, err := planTagChange("set", current, projectTags, []string{"frontend", "backend"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(plan.KeepIDs) != 0 {
			t.Errorf("KeepIDs = %v, want empty — neither name exists yet", plan.KeepIDs)
		}
		if strings.Join(plan.Create, ",") != "frontend,backend" {
			t.Errorf("Create = %v, want [frontend backend] in order", plan.Create)
		}
	})
}

func TestPlanTagChangeUnknownAction(t *testing.T) {
	current, projectTags := tagFixtures()
	_, err := planTagChange("append", current, projectTags, []string{"Bug"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "add") {
		t.Errorf("error should list the valid actions, got: %v", err)
	}
}

func TestPlanTagChangeSendsAnArrayNotNull(t *testing.T) {
	// A nil KeepIDs marshals to `null`, and the API answers
	// "tagIds must be an array" — so an empty result has to stay a non-nil slice.
	current, projectTags := tagFixtures()

	t.Run("set with no names", func(t *testing.T) {
		plan, err := planTagChange("set", current, projectTags, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		assertMarshalsAsArray(t, plan.KeepIDs)
	})

	t.Run("remove of every tag", func(t *testing.T) {
		plan, err := planTagChange("remove", current, projectTags, []string{"Bug"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		assertMarshalsAsArray(t, plan.KeepIDs)
	})
}

func assertMarshalsAsArray(t *testing.T, ids []string) {
	t.Helper()
	b, err := json.Marshal(map[string]any{"tagIds": ids})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if got := string(b); got != `{"tagIds":[]}` {
		t.Errorf("payload = %s, want {\"tagIds\":[]}", got)
	}
}

func TestCaseShadow(t *testing.T) {
	_, projectTags := tagFixtures()

	t.Run("finds a differently-cased twin", func(t *testing.T) {
		if got := caseShadow(projectTags, "BUG"); got != "Bug" && got != "bug" {
			t.Errorf("caseShadow(%q) = %q, want Bug or bug", "BUG", got)
		}
	})

	t.Run("an exact match is not a shadow", func(t *testing.T) {
		// "Feature" exists exactly; nothing is being created, so there is nothing
		// to warn about.
		if got := caseShadow([]tag{{ID: "t", Name: "Feature"}}, "Feature"); got != "" {
			t.Errorf("caseShadow = %q, want empty", got)
		}
	})

	t.Run("silent when the name is genuinely new", func(t *testing.T) {
		if got := caseShadow(projectTags, "frontend"); got != "" {
			t.Errorf("caseShadow = %q, want empty", got)
		}
	})
}
