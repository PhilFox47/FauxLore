import test from "node:test";
import assert from "node:assert/strict";
import { chooseBookEditionCover } from "./bookEditionCover";

test("Audiobooks always use the work's portrait book cover", () => {
  assert.equal(
    chooseBookEditionCover("Audiobook", "https://covers.test/book-portrait.jpg", "https://covers.test/audiobook-square.jpg"),
    "https://covers.test/book-portrait.jpg",
  );
});

test("Audiobooks never fall back to an audiobook edition's square cover", () => {
  assert.equal(chooseBookEditionCover("Audiobook", undefined, "https://covers.test/audiobook-square.jpg"), "");
});

test("Printed books retain their exact edition's cover", () => {
  assert.equal(
    chooseBookEditionCover("Book", "https://covers.test/work.jpg", "https://covers.test/specific-edition.jpg"),
    "https://covers.test/specific-edition.jpg",
  );
  assert.equal(chooseBookEditionCover("Book", "https://covers.test/work.jpg"), "https://covers.test/work.jpg");
});
