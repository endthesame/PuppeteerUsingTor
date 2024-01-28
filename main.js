const fs = require('fs');
const path = require('path');
const { crawl, extractData } = require('./crawler');
const { downloadPDFs } = require('./download-utils-puppeteer');
const { checkAccess } = require('./utils');

async function main() {
    try {
        const hostNameForDir = process.argv[2] || "default_host_name";
        const outputFolderPath = path.join(__dirname, 'output');
        const siteFolderPath = path.join(outputFolderPath, hostNameForDir);
        const jsonFolderPath = path.join(siteFolderPath, 'jsons');
        const pdfFolderPath = path.join(siteFolderPath, 'pdfs');
        const linksFilePath = path.join(siteFolderPath, 'remaining_links.txt');

        const collab_pdf_folder = path.join('/content/drive/MyDrive/royal_journals/pdfs');

        // Создать структуру папок, если они не существуют
        if (!fs.existsSync(outputFolderPath)) fs.mkdirSync(outputFolderPath);
        if (!fs.existsSync(siteFolderPath)) fs.mkdirSync(siteFolderPath);
        if (!fs.existsSync(jsonFolderPath)) fs.mkdirSync(jsonFolderPath);
        if (!fs.existsSync(pdfFolderPath)) fs.mkdirSync(pdfFolderPath);

        // Копировать файл с ссылками
        fs.copyFileSync('your_links_file.txt', linksFilePath);
        
        // Запуск краулинга
        await crawl(jsonFolderPath, pdfFolderPath, siteFolderPath, linksFilePath, downloadPDFmark = true, checkOpenAccess = true);
        
        // Запуск скачивания PDF
        await downloadPDFs(path.join("/content/drive/MyDrive/royal_journals/Links.txt"), collab_pdf_folder);
    } catch (error) {
        console.error(`Error during setup: ${error.message}`);
    }
}

main().catch((error) => {
    console.error(`Error during crawling: ${error.message}`);
    console.error(error);
});
