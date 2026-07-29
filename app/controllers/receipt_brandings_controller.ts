import CompanyReceiptBranding from "#models/company_receipt_branding";
import ReceiptLogoService from "#services/branding/receipt_logo_service";
import { uploadReceiptLogoValidator } from "#validators/receipt_branding";
import type { HttpContext } from "@adonisjs/core/http";

export default class ReceiptBrandingsController {
  public async show({ auth, companyId, response }: HttpContext) {
    if (!(await this.isCompanyAdmin(auth))) {
      return response.forbidden({
        message: "Se requieren privilegios de administrador o gerente.",
      });
    }

    try {
      const branding = await CompanyReceiptBranding.find(companyId);

      return response.ok({
        hasLogo: Boolean(branding),
        logo: branding
          ? {
              mimeType: branding.mimeType,
              sizeBytes: branding.sizeBytes,
              width: branding.width,
              height: branding.height,
              checksum: branding.checksum,
              updatedAt: branding.updatedAt,
            }
          : null,
      });
    } catch (error) {
      console.error("Error consultando logo de recibo:", error);
      return response.serviceUnavailable({
        message:
          "La personalizacion del recibo no esta disponible temporalmente.",
      });
    }
  }

  public async image({ auth, companyId, response }: HttpContext) {
    if (!(await this.isCompanyAdmin(auth))) {
      return response.forbidden({
        message: "Se requieren privilegios de administrador o gerente.",
      });
    }

    try {
      const branding = await CompanyReceiptBranding.find(companyId);

      if (!branding) {
        return response.notFound({
          message: "La empresa no tiene logo de recibo.",
        });
      }

      response.header("Content-Type", branding.mimeType);
      response.header("Content-Length", String(branding.sizeBytes));
      response.header("Cache-Control", "private, no-cache");
      response.header("ETag", `"${branding.checksum}"`);

      return response.send(branding.logoData);
    } catch (error) {
      console.error("Error descargando logo de recibo:", error);
      return response.serviceUnavailable({
        message:
          "La personalizacion del recibo no esta disponible temporalmente.",
      });
    }
  }

  public async update({ auth, companyId, request, response }: HttpContext) {
    if (!(await this.isCompanyAdmin(auth))) {
      return response.forbidden({
        message: "Se requieren privilegios de administrador o gerente.",
      });
    }

    let logo;

    try {
      const payload = await request.validateUsing(uploadReceiptLogoValidator);
      logo = payload.logo;
    } catch (error) {
      if (
        error.code === "E_VALIDATION_ERROR" ||
        error.code === "E_VALIDATION_FAILURE"
      ) {
        return response.unprocessableEntity({
          message:
            "El archivo debe ser una imagen PNG o JPEG de maximo 2 MB.",
          errors: error.messages,
        });
      }

      console.error("Error validando logo de recibo:", error);
      return response.unprocessableEntity({
        message: "No se pudo validar el archivo cargado.",
      });
    }

    if (!logo.tmpPath) {
      return response.unprocessableEntity({
        message: "No se pudo procesar el archivo cargado.",
      });
    }

    try {
      const processed = await ReceiptLogoService.process(logo.tmpPath);

      try {
        const branding = await CompanyReceiptBranding.updateOrCreate(
          { companyId },
          {
            companyId,
            logoData: processed.data,
            mimeType: processed.mimeType,
            sizeBytes: processed.sizeBytes,
            width: processed.width,
            height: processed.height,
            checksum: processed.checksum,
          },
        );

        return response.ok({
          message: "Logo de recibo actualizado correctamente.",
          logo: {
            mimeType: branding.mimeType,
            sizeBytes: branding.sizeBytes,
            width: branding.width,
            height: branding.height,
            checksum: branding.checksum,
            updatedAt: branding.updatedAt,
          },
        });
      } catch (error) {
        console.error("Error guardando logo de recibo:", error);
        return response.serviceUnavailable({
          message:
            "No fue posible guardar el logo. Intenta nuevamente mas tarde.",
        });
      }
    } catch (error) {
      if (error instanceof RangeError) {
        return response.unprocessableEntity({ message: error.message });
      }

      console.error("Error procesando logo de recibo:", error);
      return response.unprocessableEntity({
        message: "La imagen no se pudo procesar. Usa un PNG o JPEG valido.",
      });
    }
  }

  public async destroy({ auth, companyId, response }: HttpContext) {
    if (!(await this.isCompanyAdmin(auth))) {
      return response.forbidden({
        message: "Se requieren privilegios de administrador o gerente.",
      });
    }

    try {
      const branding = await CompanyReceiptBranding.find(companyId);

      if (branding) {
        await branding.delete();
      }

      return response.noContent();
    } catch (error) {
      console.error("Error eliminando logo de recibo:", error);
      return response.serviceUnavailable({
        message:
          "No fue posible eliminar el logo. Intenta nuevamente mas tarde.",
      });
    }
  }

  private async isCompanyAdmin(auth: HttpContext["auth"]): Promise<boolean> {
    const user = await auth.getUserOrFail();
    await user.load("role");

    return ["super_admin", "admin", "manager"].includes(user.role.code);
  }
}
