import os
import shutil

def rename_and_move_pdfs(source_folder):
    for root, dirs, files in os.walk(source_folder):
        for file in files:
            if file.lower().endswith('.pdf'):
                pdf_path = os.path.join(root, file)

                # Извлекаем название родительской папки
                parent_folder_name = os.path.basename(root)

                # Создаем новое имя файла, добавляя название папки к нему
                new_pdf_name = f"{parent_folder_name}.pdf"
                new_pdf_path = os.path.join(root, new_pdf_name)

                # Переименовываем файл
                os.rename(pdf_path, new_pdf_path)

                # Перемещаем файл в папку pdfs и удаляем пустую родительскую папку
                shutil.move(new_pdf_path, os.path.join(source_folder, new_pdf_name))
                os.rmdir(root)

if __name__ == "__main__":
    source_folder = "output/sage/pdfs"

    rename_and_move_pdfs(source_folder)
