package internal

import (
	"strings"
	"testing"
	"time"
)

func TestFormatFields(t *testing.T) {
	fields := []Field{
		{Key: "ticket", Value: "TK-42"},
		{Key: "title", Value: "Fix login bug"},
		{Key: "status", Value: "To Do"},
	}

	result := FormatFields(fields, false)

	// All keys should be present
	if !strings.Contains(result, "ticket:") {
		t.Error("missing ticket key")
	}
	if !strings.Contains(result, "TK-42") {
		t.Error("missing ticket value")
	}
	if !strings.Contains(result, "Fix login bug") {
		t.Error("missing title value")
	}
}

func TestFormatFieldsMultiline(t *testing.T) {
	fields := []Field{
		{Key: "title", Value: "Card"},
		{Key: "description", Value: "line 1\nline 2\nline 3"},
	}

	result := FormatFields(fields, false)

	// Multi-line values should be indented
	if !strings.Contains(result, "description:\n") {
		t.Error("multi-line value should have key on its own line")
	}
	if !strings.Contains(result, "  line 1\n") {
		t.Error("multi-line value lines should be indented")
	}
}

func TestFormatFieldsJSON(t *testing.T) {
	fields := []Field{
		{Key: "ticket", Value: "TK-1"},
		{Key: "title", Value: "Test"},
	}

	result := FormatFields(fields, true)

	if !strings.Contains(result, `"ticket": "TK-1"`) {
		t.Errorf("JSON output missing expected content: %s", result)
	}
}

func TestFormatTable(t *testing.T) {
	headers := []string{"TICKET", "TITLE", "STATUS"}
	rows := [][]string{
		{"TK-1", "Short", "Done"},
		{"TK-2", "A longer title here", "In Progress"},
	}

	result := FormatTable(headers, rows)

	lines := strings.Split(strings.TrimRight(result, "\n"), "\n")
	if len(lines) != 4 { // header + separator + 2 rows
		t.Errorf("expected 4 lines, got %d: %v", len(lines), lines)
	}

	// Header line
	if !strings.Contains(lines[0], "TICKET") || !strings.Contains(lines[0], "TITLE") {
		t.Errorf("header missing expected columns: %s", lines[0])
	}

	// Separator line
	if !strings.Contains(lines[1], "---") {
		t.Errorf("separator line missing dashes: %s", lines[1])
	}

	// Data rows
	if !strings.Contains(lines[2], "TK-1") || !strings.Contains(lines[2], "Short") {
		t.Errorf("row 1 missing data: %s", lines[2])
	}
	if !strings.Contains(lines[3], "TK-2") || !strings.Contains(lines[3], "In Progress") {
		t.Errorf("row 2 missing data: %s", lines[3])
	}
}

func TestFormatTableAlignment(t *testing.T) {
	headers := []string{"A", "B"}
	rows := [][]string{
		{"short", "x"},
		{"a much longer value", "y"},
	}

	result := FormatTable(headers, rows)
	lines := strings.Split(strings.TrimRight(result, "\n"), "\n")

	// All "B"/"x"/"y" values should start at the same column
	headerBPos := strings.Index(lines[0], "B")
	row1BPos := strings.Index(lines[2], "x")
	row2BPos := strings.Index(lines[3], "y")

	if headerBPos != row1BPos || headerBPos != row2BPos {
		t.Errorf("columns not aligned: header=%d, row1=%d, row2=%d", headerBPos, row1BPos, row2BPos)
	}
}

func TestFormatTimestamp(t *testing.T) {
	t.Run("passes an unparseable value through", func(t *testing.T) {
		for _, in := range []string{"", "not a date", "2026-08-20"} {
			if got := FormatTimestamp(in); got != in {
				t.Errorf("FormatTimestamp(%q) = %q, want it unchanged", in, got)
			}
		}
	})

	t.Run("renders the same instant identically whatever offset it arrives in", func(t *testing.T) {
		// The API sends UTC today. If it ever sends an offset instead, the rendered
		// wall clock must not shift — that is what normalising to local time buys.
		utc := FormatTimestamp("2026-08-20T12:32:00.000Z")
		offset := FormatTimestamp("2026-08-20T14:32:00.000+02:00")
		if utc != offset {
			t.Errorf("same instant rendered as %q and %q", utc, offset)
		}
	})

	t.Run("renders a minute-precision wall clock", func(t *testing.T) {
		got := FormatTimestamp("2026-08-20T12:32:09.000Z")
		want := time.Date(2026, 8, 20, 12, 32, 9, 0, time.UTC).Local().Format("2006-01-02 15:04")
		if got != want {
			t.Errorf("FormatTimestamp = %q, want %q", got, want)
		}
		if strings.Contains(got, ":09") {
			t.Errorf("seconds should not print: %q", got)
		}
	})
}
