import "@testing-library/jest-dom";
import { vi } from "vitest";

// jsdom does not implement scrollIntoView — stub it globally so components
// that call bottomRef.current?.scrollIntoView() don't crash in tests.
window.HTMLElement.prototype.scrollIntoView = vi.fn();
