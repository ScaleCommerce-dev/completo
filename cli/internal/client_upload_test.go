package internal

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPostFileSendsMultipartWithLength(t *testing.T) {
	var gotLen int64
	var gotName, gotType, gotBody, gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotLen = r.ContentLength
		gotAuth = r.Header.Get("Authorization")
		f, h, err := r.FormFile("file")
		if err != nil {
			t.Errorf("FormFile: %v", err)
			http.Error(w, "bad", 400)
			return
		}
		b, _ := io.ReadAll(f)
		gotName, gotType, gotBody = h.Filename, h.Header.Get("Content-Type"), string(b)
		w.WriteHeader(201)
		w.Write([]byte(`{"id":"a1"}`))
	}))
	defer srv.Close()
	c := &Client{BaseURL: srv.URL, Token: "dzo_x", HTTPClient: srv.Client()}

	res, err := c.PostFile("/api/cards/1/attachments", "file", `we"ird.csv`, "text/csv", []byte("a,b\n1,2\n"))
	if err != nil {
		t.Fatal(err)
	}
	if string(res) != `{"id":"a1"}` {
		t.Errorf("response %s", res)
	}
	if gotLen <= 0 {
		t.Errorf("no Content-Length: the server checks it before reading the body")
	}
	if gotAuth != "Bearer dzo_x" || gotName != `we"ird.csv` || gotType != "text/csv" || gotBody != "a,b\n1,2\n" {
		t.Errorf("got auth=%q name=%q type=%q body=%q", gotAuth, gotName, gotType, gotBody)
	}
}

func TestPostFileAndDownloadReportServerErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(415)
		w.Write([]byte(`{"message":"File type not allowed"}`))
	}))
	defer srv.Close()
	c := &Client{BaseURL: srv.URL, Token: "t", HTTPClient: srv.Client()}

	if _, err := c.PostFile("/x", "file", "a.exe", "", []byte("MZ")); err == nil || !strings.Contains(err.Error(), "File type not allowed") {
		t.Errorf("upload: %v", err)
	}
	var buf bytes.Buffer
	if _, err := c.Download("/x", &buf); err == nil || buf.Len() != 0 {
		t.Errorf("download: err=%v, wrote %d bytes of an error page", err, buf.Len())
	}
}

func TestDownloadStreamsTheBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("payload"))
	}))
	defer srv.Close()
	c := &Client{BaseURL: srv.URL, Token: "t", HTTPClient: srv.Client()}
	var buf bytes.Buffer
	n, err := c.Download("/f", &buf)
	if err != nil || n != 7 || buf.String() != "payload" {
		t.Errorf("n=%d err=%v body=%q", n, err, buf.String())
	}
}
