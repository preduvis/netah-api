import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CategoriesService } from './categories.service';
import { CreateTaskCategoryDto } from './dto/create-task-category.dto';
import { UpdateTaskCategoryDto } from './dto/update-task-category.dto';
import { ResponseMessage } from 'src/response/response.decorator';
import { AdminJwtAuthGuard } from 'src/auth/guards/admin-jwt-auth.guard';
import { MustChangePasswordGuard } from 'src/auth/guards/must-change-password.guard';
import { Must2FAGuard } from 'src/auth/guards/must-2fa.guard';

@UseGuards(AdminJwtAuthGuard, MustChangePasswordGuard, Must2FAGuard)
@Controller('admin/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @ResponseMessage('Category created successfully!')
  @Post()
  create(@Body() createCategoryDto: CreateTaskCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @ResponseMessage('All categories retrieved successfully!')
  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @ResponseMessage('Category retrieved successfully!')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(+id);
  }

  @ResponseMessage('Category updated successfully!')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCategoryDto: UpdateTaskCategoryDto) {
    return this.categoriesService.update(+id, updateCategoryDto);
  }

  @ResponseMessage('Category deleted successfully!')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(+id);
  }

  @ResponseMessage('Category image uploaded successfully!')
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('file'))
  uploadImage(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(image\/jpeg|image\/jpg|image\/png|image\/webp|image\/svg\+xml)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.categoriesService.uploadImage(+id, file);
  }

  @ResponseMessage('Category image deleted successfully!')
  @Delete(':id/image')
  deleteImage(@Param('id') id: string) {
    return this.categoriesService.deleteImage(+id);
  }
}
