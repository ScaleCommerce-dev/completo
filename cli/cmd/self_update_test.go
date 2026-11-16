package cmd

import (
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestCompareSemver(t *testing.T) {
	tests := []struct {
		a, b string
		want int
	}{
		{"v0.1.0", "v0.1.0", 0},
		{"v0.2.0", "v0.1.0", 1},
		{"v0.1.0", "v0.2.0", -1},
		{"v0.10.0", "v0.9.0", 1},
		{"v1.0.0", "v0.99.99", 1},
		{"v0.1.1", "v0.1.0", 1},
		{"v0.1.0", "v0.1.1", -1},
		// Without v prefix
		{"0.1.0", "0.1.0", 0},
		{"1.0.0", "0.1.0", 1},
		// Pre-release suffix stripped
		{"v0.2.0-beta", "v0.1.0", 1},
		{"v0.1.0-rc1", "v0.1.0", 0},
		// Partial versions
		{"v1", "v0.9.9", 1},
		{"v0.1", "v0.1.0", 0},
	}

	for _, tt := range tests {
		got := compareSemver(tt.a, tt.b)
		if got != tt.want {
			t.Errorf("compareSemver(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestVerifyChecksum(t *testing.T) {
	data := []byte("binary")
	sum := sha256.Sum256(data)
	good := hex.EncodeToString(sum[:])
	sums := []byte(good + "  completo-linux-amd64\n0000  completo-darwin-arm64\n")

	if err := verifyChecksum(data, "completo-linux-amd64", sums); err != nil {
		t.Fatalf("matching checksum refused: %v", err)
	}
	if err := verifyChecksum([]byte("tampered"), "completo-linux-amd64", sums); err == nil {
		t.Fatal("tampered binary accepted")
	}
	if err := verifyChecksum(data, "completo-windows-amd64.exe", sums); err == nil {
		t.Fatal("binary missing from checksums.txt accepted")
	}
}
