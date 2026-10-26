import assert from "node:assert/strict";
import { test } from "node:test";
import {
  trainingVideoSource,
  videoSignature,
  validTrainingVideoPath,
} from "../src/lib/trainings/media.ts";
import { uploadTrainingVideo } from "../src/lib/trainings/upload-video.ts";
test("video embeds use allowlisted hosts and validated IDs; arbitrary HTTPS stays external", () => {
  assert.deepEqual(trainingVideoSource("https://youtu.be/aqz-KE-bpKQ"), {
    kind: "embed",
    url: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ",
  });
  assert.equal(
    trainingVideoSource("https://youtube.com.evil.invalid/watch?v=aqz-KE-bpKQ")
      .kind,
    "external",
  );
  assert.equal(
    trainingVideoSource("https://vimeo.com/123456").url,
    "https://player.vimeo.com/video/123456",
  );
  assert.equal(
    trainingVideoSource("https://example.invalid/video.mp4?x=1").kind,
    "file",
  );
  assert.throws(() => trainingVideoSource("javascript:alert(1)"));
  assert.throws(() =>
    trainingVideoSource("https://user:pass@example.invalid/video.mp4"),
  );
});
test("media pointers stay scoped to their owner and MIME signatures must match", () => {
  const id = "11111111-1111-4111-8111-111111111111",
    path = id + "/22222222-2222-4222-8222-222222222222.mp4";
  assert.equal(validTrainingVideoPath(id, path), true);
  assert.equal(
    validTrainingVideoPath("33333333-3333-4333-8333-333333333333", path),
    false,
  );
  assert.equal(validTrainingVideoPath(id, path + "/../x"), false);
  assert.equal(
    videoSignature(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), "video/webm"),
    true,
  );
  assert.equal(
    videoSignature(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), "video/mp4"),
    false,
  );
  assert.equal(
    videoSignature(new TextEncoder().encode("<html>bad</html>"), "video/mp4"),
    false,
  );
});
test("TUS resumes the confirmed offset after a lost response without sending the committed chunk again", async () => {
  const original = global.fetch,
    chunk = 6 * 1024 * 1024,
    file = new File([new Uint8Array(chunk + 17)], "qa.mp4", {
      type: "video/mp4",
    });
  let offset = 0,
    patched = 0,
    heads = 0;
  const progress = [];
  global.fetch = async (_url, options) => {
    if (options.method === "POST")
      return new Response(null, {
        status: 201,
        headers: {
          location:
            "https://example.supabase.co/storage/v1/upload/resumable/sign/qa",
        },
      });
    if (options.method === "HEAD") {
      heads++;
      return new Response(null, {
        status: 200,
        headers: { "upload-offset": String(offset) },
      });
    }
    assert.equal(Number(options.headers["Upload-Offset"]), offset);
    offset += options.body.size;
    patched++;
    if (patched === 1) throw Error("Lost acknowledgement");
    return new Response(null, {
      status: 204,
      headers: { "upload-offset": String(offset) },
    });
  };
  try {
    await uploadTrainingVideo(
      file,
      {
        endpoint:
          "https://example.supabase.co/storage/v1/upload/resumable/sign",
        token: "qa",
        path: "qa.mp4",
      },
      (v) => progress.push(v),
    );
    assert.equal(patched, 2);
    assert.equal(heads, 1);
    assert.equal(offset, file.size);
    assert.equal(progress.at(-1), 100);
  } finally {
    global.fetch = original;
  }
});
test("an unresponsive TUS server never reports completion and stops after bounded retries", async () => {
  const original = global.fetch;
  let attempts = 0;
  const progress = [];
  global.fetch = async (_url, options) => {
    if (options.method === "POST")
      return new Response(null, {
        status: 201,
        headers: {
          location:
            "https://example.supabase.co/storage/v1/upload/resumable/sign/qa",
        },
      });
    if (options.method === "HEAD")
      return new Response(null, {
        status: 200,
        headers: { "upload-offset": "0" },
      });
    attempts++;
    throw Error("offline");
  };
  try {
    await assert.rejects(
      uploadTrainingVideo(
        new File(["x"], "qa.mp4", { type: "video/mp4" }),
        {
          endpoint:
            "https://example.supabase.co/storage/v1/upload/resumable/sign",
          token: "qa",
          path: "qa.mp4",
        },
        (v) => progress.push(v),
      ),
      /interrumpió/,
    );
    assert.equal(attempts, 4);
    assert.ok(!progress.includes(100));
  } finally {
    global.fetch = original;
  }
});
