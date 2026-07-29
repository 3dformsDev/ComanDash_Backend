import vine from "@vinejs/vine";

export const uploadReceiptLogoValidator = vine.compile(
  vine.object({
    logo: vine.file({
      size: "2mb",
      extnames: ["jpg", "jpeg", "png"],
    }),
  }),
);
