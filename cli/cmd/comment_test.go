package cmd

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/scalecommerce-dev/completo/cli/internal"
)

func strptr(s string) *string { return &s }

func commentFixtures() []comment {
	return []comment{
		{
			ID: "3f2a1b9c-1111-4000-8000-000000000001", CardID: 42,
			Body: "First thought", AuthorName: strptr("Thomas Lohner"),
			CreatedAt: "2026-08-20T12:32:00.000Z", UpdatedAt: "2026-08-20T12:32:00.000Z",
		},
		{
			ID: "3f2a1b9c-2222-4000-8000-000000000002", CardID: 42,
			Body: "Second thought", AuthorName: strptr("Ada"),
			CreatedAt: "2026-08-20T13:01:00.000Z", UpdatedAt: "2026-08-20T13:05:00.000Z",
		},
		{
			ID: "7c1d0e4f-3333-4000-8000-000000000003", CardID: 42,
			Body: "line one\nline two", AuthorName: nil,
			CreatedAt: "2026-08-20T14:00:00.000Z", UpdatedAt: "2026-08-20T14:00:00.000Z",
		},
	}
}

func TestResolveCommentRef(t *testing.T) {
	comments := commentFixtures()

	t.Run("matches a full ID", func(t *testing.T) {
		c, err := resolveCommentRef(comments, "7c1d0e4f-3333-4000-8000-000000000003")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if c.Body != "line one\nline two" {
			t.Errorf("resolved the wrong comment: %q", c.Body)
		}
	})

	t.Run("matches a unique prefix", func(t *testing.T) {
		c, err := resolveCommentRef(comments, "7c1d0e4f")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if c.ID != "7c1d0e4f-3333-4000-8000-000000000003" {
			t.Errorf("got %q", c.ID)
		}
	})

	t.Run("errors on an ambiguous prefix and names the candidates", func(t *testing.T) {
		// The printed short form is 8 chars; these two share it, so the resolver
		// has to refuse rather than pick the first.
		_, err := resolveCommentRef(comments, "3f2a1b9c")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		for _, want := range []string{"3f2a1b9c-1111-4000-8000-000000000001", "3f2a1b9c-2222-4000-8000-000000000002"} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("error should list %q, got: %v", want, err)
			}
		}
	})

	t.Run("a longer prefix disambiguates", func(t *testing.T) {
		c, err := resolveCommentRef(comments, "3f2a1b9c-2")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if c.Body != "Second thought" {
			t.Errorf("resolved the wrong comment: %q", c.Body)
		}
	})

	t.Run("errors on no match", func(t *testing.T) {
		if _, err := resolveCommentRef(comments, "deadbeef"); err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("errors on an empty ref", func(t *testing.T) {
		if _, err := resolveCommentRef(comments, ""); err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("errors against an empty comment list", func(t *testing.T) {
		if _, err := resolveCommentRef(nil, "3f2a1b9c"); err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestFormatComments(t *testing.T) {
	t.Run("reports an empty list", func(t *testing.T) {
		if got := formatComments(nil); got != "No comments.\n" {
			t.Errorf("got %q", got)
		}
	})

	out := formatComments(commentFixtures())

	t.Run("prints an ID short enough to retype and long enough to resolve", func(t *testing.T) {
		if !strings.Contains(out, "7c1d0e4f  ") {
			t.Errorf("missing the short ID:\n%s", out)
		}
		if strings.Contains(out, "7c1d0e4f-3333") {
			t.Errorf("the full UUID should not print in list output:\n%s", out)
		}
		// What prints has to be usable as an argument.
		if _, err := resolveCommentRef(commentFixtures(), "7c1d0e4f"); err != nil {
			t.Errorf("the printed short ID does not resolve: %v", err)
		}
	})

	t.Run("marks an edited comment only when it was edited", func(t *testing.T) {
		lines := strings.Split(out, "\n")
		var edited []string
		for _, l := range lines {
			if strings.Contains(l, "(edited") {
				edited = append(edited, l)
			}
		}
		if len(edited) != 1 {
			t.Fatalf("want exactly one edited marker, got %d:\n%s", len(edited), out)
		}
		if !strings.Contains(edited[0], "Ada") {
			t.Errorf("the edited marker landed on the wrong comment: %q", edited[0])
		}
	})

	t.Run("indents every line of a multi-line body", func(t *testing.T) {
		if !strings.Contains(out, "\n  line one\n  line two\n") {
			t.Errorf("multi-line body not indented per line:\n%s", out)
		}
	})

	t.Run("names a deleted author rather than printing a blank column", func(t *testing.T) {
		if !strings.Contains(out, "(deleted user)") {
			t.Errorf("missing the deleted-author placeholder:\n%s", out)
		}
	})

	t.Run("aligns the author column to the widest name", func(t *testing.T) {
		// "Thomas Lohner" is the widest; every timestamp must start at the same
		// column, or the list stops scanning as a list. The expected timestamps are
		// derived, not literal — FormatTimestamp renders in local time.
		var cols []int
		for _, c := range commentFixtures() {
			ts := internal.FormatTimestamp(c.CreatedAt)
			i := strings.Index(out, ts)
			if i < 0 {
				t.Fatalf("timestamp %q missing from output:\n%s", ts, out)
			}
			cols = append(cols, i-strings.LastIndex(out[:i], "\n")-1)
		}
		for _, c := range cols[1:] {
			if c != cols[0] {
				t.Errorf("timestamp columns misaligned: %v\n%s", cols, out)
			}
		}
	})
}

func TestIndentBody(t *testing.T) {
	t.Run("indents each line", func(t *testing.T) {
		if got := indentBody("a\nb"); got != "  a\n  b\n" {
			t.Errorf("got %q", got)
		}
	})

	t.Run("leaves a blank line blank", func(t *testing.T) {
		// A blank line carrying the indent means trailing whitespace in anything
		// the user copies out of the terminal.
		got := indentBody("a\n\nb")
		if got != "  a\n\n  b\n" {
			t.Errorf("got %q, want %q", got, "  a\n\n  b\n")
		}
		for _, line := range strings.Split(got, "\n") {
			if line != strings.TrimRight(line, " \t") {
				t.Errorf("line %q has trailing whitespace", line)
			}
		}
	})

	t.Run("drops trailing newlines", func(t *testing.T) {
		if got := indentBody("a\n\n\n"); got != "  a\n" {
			t.Errorf("got %q", got)
		}
	})
}

func TestFormatCommentsEditMarker(t *testing.T) {
	t.Run("omits the time when an edit lands in the same minute", func(t *testing.T) {
		out := formatComments([]comment{{
			ID: "aaaaaaaa-1111-4000-8000-000000000001", Body: "x", AuthorName: strptr("Ada"),
			CreatedAt: "2026-08-20T13:01:05.000Z", UpdatedAt: "2026-08-20T13:01:40.000Z",
		}})
		if !strings.Contains(out, "(edited)") {
			t.Errorf("want a bare (edited) marker, got:\n%s", out)
		}
	})

	t.Run("no marker on an untouched comment", func(t *testing.T) {
		out := formatComments([]comment{{
			ID: "aaaaaaaa-1111-4000-8000-000000000001", Body: "x", AuthorName: strptr("Ada"),
			CreatedAt: "2026-08-20T13:01:05.000Z", UpdatedAt: "2026-08-20T13:01:05.000Z",
		}})
		if strings.Contains(out, "edited") {
			t.Errorf("unexpected edited marker:\n%s", out)
		}
	})
}

func TestFormatCardComments(t *testing.T) {
	t.Run("says none, aligned with the card's fields", func(t *testing.T) {
		got := formatCardComments([]comment{}, "TK-42")
		// The value column is derived from the card view itself, so the line
		// keeps lining up if formatCard gains a longer key.
		card := formatCard(&cardResponse{card: card{ID: 42, Title: "t"}, Project: &projectInfo{Key: "TK"}})
		var col int
		for _, l := range strings.Split(card, "\n") {
			if strings.HasPrefix(l, "attachments:") {
				col = len(l) - len(strings.TrimLeft(l[len("attachments:"):], " "))
			}
		}
		if col == 0 {
			t.Fatalf("no attachments line in card view:\n%s", card)
		}
		if want := "comments:" + strings.Repeat(" ", col-len("comments:")) + "none\n"; got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	})

	t.Run("prints every comment under a heading with the count", func(t *testing.T) {
		got := formatCardComments(commentFixtures(), "TK-42")
		if !strings.HasPrefix(got, "comments (3):\n") {
			t.Errorf("heading: %q", strings.SplitN(got, "\n", 2)[0])
		}
		for _, c := range commentFixtures() {
			for _, line := range strings.Split(c.Body, "\n") {
				if !strings.Contains(got, "\n    "+line+"\n") {
					t.Errorf("body line %q missing or not indented under the heading:\n%s", line, got)
				}
			}
		}
	})

	t.Run("keeps the newest when the thread is long, and says how to see the rest", func(t *testing.T) {
		var many []comment
		for i := 0; i < cardCommentLimit+3; i++ {
			many = append(many, comment{
				ID:   fmt.Sprintf("%08d-0000-4000-8000-000000000000", i),
				Body: fmt.Sprintf("comment number %d", i), AuthorName: strptr("Ada"),
				CreatedAt: "2026-08-20T12:00:00.000Z", UpdatedAt: "2026-08-20T12:00:00.000Z",
			})
		}
		got := formatCardComments(many, "TK-42")
		if !strings.Contains(strings.SplitN(got, "\n", 2)[0], "completo comment TK-42") {
			t.Errorf("heading should point at the full list: %q", strings.SplitN(got, "\n", 2)[0])
		}
		if strings.Contains(got, "comment number 2\n") {
			t.Errorf("an old comment printed although the thread was cut:\n%s", got)
		}
		if !strings.Contains(got, fmt.Sprintf("comment number %d\n", len(many)-1)) {
			t.Errorf("the newest comment is missing:\n%s", got)
		}
		if n := strings.Count(got, "comment number "); n != cardCommentLimit {
			t.Errorf("printed %d comments, want %d", n, cardCommentLimit)
		}
	})

	t.Run("leaves no trailing whitespace on blank body lines", func(t *testing.T) {
		got := formatCardComments([]comment{{ID: "aaaaaaaa", Body: "a\n\nb", AuthorName: strptr("Ada"), CreatedAt: "2026-08-20T12:00:00.000Z", UpdatedAt: "2026-08-20T12:00:00.000Z"}}, "TK-42")
		for _, line := range strings.Split(got, "\n") {
			if line != strings.TrimRight(line, " ") {
				t.Errorf("line %q has trailing whitespace", line)
			}
		}
	})
}

func TestWithComments(t *testing.T) {
	out, err := withComments([]byte(`{"id":42,"title":"t","tags":[]}`), nil)
	if err != nil {
		t.Fatal(err)
	}
	var obj map[string]any
	if err := json.Unmarshal(out, &obj); err != nil {
		t.Fatal(err)
	}
	if obj["title"] != "t" || obj["id"] != float64(42) {
		t.Errorf("card fields changed: %s", out)
	}
	// An empty array, not null: a script iterating comments should not have to
	// special-case a card without any.
	if c, ok := obj["comments"].([]any); !ok || len(c) != 0 {
		t.Errorf("comments should be an empty array, got %s", out)
	}
}
