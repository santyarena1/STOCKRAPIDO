import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiInvoiceService, UploadedInvoiceFile } from './ai-invoice.service';
import { AiInvoiceCallbackDto } from './dto/ai-invoice-callback.dto';

type User = { businessId: string };

@Controller('purchases/ai-invoice')
export class AiInvoiceController {
  constructor(private readonly aiInvoice: AiInvoiceService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async upload(
    @CurrentUser() user: User,
    @UploadedFile() file: UploadedInvoiceFile | undefined,
    @Query('sendOnly') sendOnly?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Subí un archivo (campo file).');
    }
    const onlySend = sendOnly === '1' || sendOnly === 'true';
    return this.aiInvoice.createJobFromUpload(user.businessId, file, { sendOnly: onlySend });
  }

  @Get(':jobId')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: User, @Param('jobId') jobId: string) {
    const job = this.aiInvoice.getJobForBusiness(jobId, user.businessId);
    if (job.status === 'completed' && job.result) {
      return {
        status: job.status,
        filename: job.filename,
        result: job.result,
      };
    }
    if (job.status === 'failed') {
      return {
        status: job.status,
        filename: job.filename,
        error: job.error ?? 'Error desconocido',
      };
    }
    return {
      status: job.status,
      filename: job.filename,
    };
  }

  /** Llamado por N8N cuando terminó de extraer datos (header X-Webhook-Secret). */
  @Post('callback')
  callback(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: AiInvoiceCallbackDto,
  ) {
    return this.aiInvoice.applyCallback(headers, body);
  }
}
