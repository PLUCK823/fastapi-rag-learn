import { describe, expect, it } from "vitest";
import { getErrorMessage } from "./error";

describe("getErrorMessage", () => {
  it("maps LOGIN_BAD_CREDENTIALS to Chinese", () => {
    const err = {
      isAxiosError: true,
      response: { data: { detail: "LOGIN_BAD_CREDENTIALS" }, status: 400 },
    };
    expect(getErrorMessage(err)).toBe("邮箱或密码错误");
  });

  it("maps REGISTER_USER_ALREADY_EXISTS to Chinese", () => {
    const err = {
      isAxiosError: true,
      response: { data: { detail: "REGISTER_USER_ALREADY_EXISTS" }, status: 400 },
    };
    expect(getErrorMessage(err)).toBe("该邮箱已被注册");
  });

  it("maps RESET_PASSWORD_BAD_TOKEN to Chinese", () => {
    const err = {
      isAxiosError: true,
      response: { data: { detail: "RESET_PASSWORD_BAD_TOKEN" }, status: 400 },
    };
    expect(getErrorMessage(err)).toBe("密码重置链接已失效");
  });

  it("passes through custom Chinese messages unchanged", () => {
    const err = {
      isAxiosError: true,
      response: { data: { detail: "该账号不存在" }, status: 400 },
    };
    expect(getErrorMessage(err)).toBe("该账号不存在");
  });

  it("passes through unknown error details unchanged", () => {
    const err = {
      isAxiosError: true,
      response: { data: { detail: "Some unknown error" }, status: 400 },
    };
    expect(getErrorMessage(err)).toBe("Some unknown error");
  });

  it("strips Pydantic Value error prefix", () => {
    const err = {
      isAxiosError: true,
      response: {
        data: { detail: "Value error, 密码格式不符合要求" },
        status: 422,
      },
    };
    expect(getErrorMessage(err)).toBe("密码格式不符合要求");
  });
});
