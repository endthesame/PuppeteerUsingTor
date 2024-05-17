const fs = require('fs');
const path = require('path');
const { crawl, extractData, parsing } = require('./crawler');
const { downloadPDFs } = require('./download-utils-puppeteer');
const { checkAccess } = require('./utils');
const {Command} = require('commander')

async function main() {
    try {
        const program = new Command()
        program
            .name('Crawler')
            .description('CLI')
            .version('0.0.1');

        program
            .option('-c, --coll_name <string>', 'collection name', 'default_host_name')
            .option('-o, --output <path>', 'path to output filder', path.join(__dirname, 'output'))
            .option('-d, --download_pdf', 'type this if you want to download pdfs')
            .option('-oa, --open_access', 'type this if you want to check open access before download')

        program.parse();

        const hostNameForDir = program.opts().coll_name;//process.argv[2] || "default_host_name";
        const outputFolderPath = program.opts().output;//path.join(__dirname, 'output');
        const siteFolderPath = path.join(outputFolderPath, hostNameForDir);
        const jsonFolderPath = path.join(siteFolderPath, 'jsons');
        const pdfFolderPath = path.join(siteFolderPath, 'pdfs');
        const htmlFolderPath = path.join(siteFolderPath, 'htmls');
        const linksFilePath = path.join(siteFolderPath, 'remaining_links.txt');

        // Создать структуру папок, если они не существуют
        if (!fs.existsSync(outputFolderPath)) fs.mkdirSync(outputFolderPath);
        if (!fs.existsSync(siteFolderPath)) fs.mkdirSync(siteFolderPath);
        if (!fs.existsSync(jsonFolderPath)) fs.mkdirSync(jsonFolderPath);
        if (!fs.existsSync(pdfFolderPath)) fs.mkdirSync(pdfFolderPath);
        if (!fs.existsSync(htmlFolderPath)) fs.mkdirSync(htmlFolderPath);

        // Копировать файл с ссылками
        fs.copyFileSync('your_links_file.txt', linksFilePath);
        
        // Запуск краулинга
        await crawl(jsonFolderPath, pdfFolderPath, htmlFolderPath, siteFolderPath, linksFilePath, downloadPDFmark = true, checkOpenAccess = true);
        
        // Запуск скачивания PDF
        await downloadPDFs(path.join(siteFolderPath, "Links.txt"), pdfFolderPath);

        // Запуск обновления метаполей (парсинга)
        //await parsing(jsonFolderPath, htmlFolderPath);
    } catch (error) {
        console.error(`Error during setup: ${error.message}`);
    }
}

main().catch((error) => {
    console.error(`Error during crawling: ${error.message}`);
    console.error(error);
});
