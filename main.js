const fs = require('fs');
const path = require('path');
const { crawl } = require('./crawler');
const { parsing } = require('./parser'); 
const { downloadPDFs } = require('./download-utils-puppeteer');
const {Command} = require('commander')

async function setupDirectories(options) {
    const { coll_name, output, links } = options;
    const siteFolderPath = path.join(output, coll_name);
    const jsonFolderPath = path.join(siteFolderPath, 'jsons');
    const pdfFolderPath = path.join(siteFolderPath, 'pdfs');
    const htmlFolderPath = path.join(siteFolderPath, 'htmls');
    const linksFilePath = path.join(siteFolderPath, 'remaining_links.txt');

    // create folder structure if it doesn't exist
    if (!fs.existsSync(output)) fs.mkdirSync(output);
    if (!fs.existsSync(siteFolderPath)) fs.mkdirSync(siteFolderPath);
    if (!fs.existsSync(jsonFolderPath)) fs.mkdirSync(jsonFolderPath);
    if (!fs.existsSync(pdfFolderPath)) fs.mkdirSync(pdfFolderPath);
    if (!fs.existsSync(htmlFolderPath)) fs.mkdirSync(htmlFolderPath);

    // copy file with links
    if (links) {
        fs.copyFileSync(links, linksFilePath);
    }

    return { siteFolderPath, jsonFolderPath, pdfFolderPath, htmlFolderPath, linksFilePath };
}

async function main() {
    const program = new Command();

    // global options (available for all commands)
    program
        .name('Crawler')
        .description('Puppeteer crawler using Node.js. You can crawl metadata, download PDFs, check open access, etc.')
        .version('0.0.1')
        .option('-c, --coll_name <string>', 'collection name', 'default_host_name')
        .option('-o, --output <path>', 'path to output folder', path.join(__dirname, 'output'))
        .option('-e, --task <path>', 'path to task extractor', path.join(__dirname, 'tasks/sample_task.js'))
        .option('-l, --links <path>', 'path to file with links', path.join(__dirname, 'your_links_file.txt'))
        .helpOption('-e, --HELP', 'read more information');

    // crawling command
    program
        .command('crawl')
        .description('Run the crawler and optionally download PDFs')
        .option('-d, --download_pdf', 'download PDFs after crawling')
        .option('-oa, --open_access', 'check open access before download')
        .option('-t, --use_tor', 'use Tor for crawling')
        .option('-ss, --upload_ssh', 'upload source data via SSH')
        .action(async (options) => {
            const globalOptions = program.opts();
            const { siteFolderPath, jsonFolderPath, pdfFolderPath, htmlFolderPath, linksFilePath } = await setupDirectories(globalOptions);

            // launch crawling
            await crawl(jsonFolderPath, pdfFolderPath, htmlFolderPath, siteFolderPath, linksFilePath, {
                taskPath: globalOptions.task,
                downloadPDF: options.download_pdf,
                checkOpenAccess: options.open_access,
                useTor: options.use_tor,
                uploadViaSSH: options.upload_ssh
            });

            // launch downloading pdf 
            if (options.download_pdf) {
                await downloadPDFs(path.join(siteFolderPath, "Links.txt"), pdfFolderPath);
            }
        });

    // parsing command
    program
        .command('parsing')
        .description('Run parsing of metadata and HTML files')
        .action(async () => {
            const globalOptions = program.opts();
            const { jsonFolderPath, htmlFolderPath } = await setupDirectories(globalOptions);

            // launch parsing
            await parsing(jsonFolderPath, htmlFolderPath, globalOptions.task);
        });

    await program.parseAsync(process.argv);
}


main().catch((error) => {
    console.error(`Error during crawling: ${error.message}`);
    console.error(error);
});