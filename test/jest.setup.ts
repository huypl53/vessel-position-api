jest.mock("playwright-extra-plugin-stealth", () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
}));

jest.mock("playwright-extra", () => {
  const actual = jest.requireActual("playwright-extra");
  return {
    __esModule: true,
    ...actual,
    chromium: {
      ...actual.chromium,
    },
  };
});

export {};
