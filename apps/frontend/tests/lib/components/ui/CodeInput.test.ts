// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render } from "@testing-library/svelte";
import { expect, test } from "vitest";
import CodeInput from "#lib/components/ui/CodeInput.svelte";

const cellText = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-pin-input-cell]")].map((cell) => cell.textContent?.trim() ?? "");

test("shows six empty cells around one real input that the id labels", () => {
  const { container } = render(CodeInput, { props: { id: "code" } });
  expect(cellText(container)).toEqual(["", "", "", "", "", ""]);
  const input = container.querySelector("input")!;
  expect(input.id).toBe("code");
  expect(container.querySelectorAll("input")).toHaveLength(1);
});

test("the input asks for a numeric one-time code, so phones and password managers fill it", () => {
  const { container } = render(CodeInput, { props: { id: "code" } });
  const input = container.querySelector("input")!;
  expect(input).toHaveAttribute("autocomplete", "one-time-code");
  expect(input).toHaveAttribute("inputmode", "numeric");
  expect(input).toHaveAttribute("maxlength", "6");
});

test("passes name and data attributes through to the input", () => {
  const { container } = render(CodeInput, {
    props: { id: "code", name: "otp", "data-1p-ignore": "", "data-step-focus": true },
  });
  const input = container.querySelector("input")!;
  expect(input).toHaveAttribute("name", "otp");
  expect(input).toHaveAttribute("data-1p-ignore");
  expect(input).toHaveAttribute("data-step-focus");
});

test("each typed digit fills the next cell", async () => {
  const { container } = render(CodeInput, { props: { id: "code" } });
  await fireEvent.input(container.querySelector("input")!, { target: { value: "123" } });
  expect(cellText(container)).toEqual(["1", "2", "3", "", "", ""]);
});

test("a pasted or filled code keeps only its digits, at most six", async () => {
  const { container } = render(CodeInput, { props: { id: "code" } });
  const input = container.querySelector("input")!;
  await fireEvent.input(input, { target: { value: " 12-34 5678" } });
  expect(input).toHaveValue("123456");
  expect(cellText(container)).toEqual(["1", "2", "3", "4", "5", "6"]);
});

test("letters are dropped rather than rejecting the digits typed so far", async () => {
  const { container } = render(CodeInput, { props: { id: "code" } });
  const input = container.querySelector("input")!;
  await fireEvent.input(input, { target: { value: "12a" } });
  expect(input).toHaveValue("12");
  await fireEvent.input(input, { target: { value: "124" } });
  expect(cellText(container)).toEqual(["1", "2", "4", "", "", ""]);
});
