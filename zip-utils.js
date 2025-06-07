// Simple ZIP implementation for EPUB generation in Chrome extension service workers
// Based on minimal ZIP file format specification

class SimpleZip {
    constructor() {
        this.files = [];
        this.folders = new Set();
    }

    file(path, content) {
        // Ensure parent folders exist
        const parts = path.split('/');
        let currentPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
            currentPath += (currentPath ? '/' : '') + parts[i];
            this.folders.add(currentPath);
        }

        this.files.push({
            path: path,
            content: typeof content === 'string' ? new TextEncoder().encode(content) : content,
            isFolder: false
        });
    }

    folder(name) {
        this.folders.add(name);
        return {
            file: (path, content) => {
                this.file(`${name}/${path}`, content);
            }
        };
    }

    async generateAsync(options = {}) {
        const zipData = [];
        const centralDirectory = [];
        let offset = 0;

        // Add folders first
        for (const folderPath of this.folders) {
            const folderData = this.createFileEntry(folderPath + '/', new Uint8Array(0), true);
            zipData.push(folderData.localFileHeader);
            
            centralDirectory.push(this.createCentralDirectoryEntry(
                folderPath + '/', 
                new Uint8Array(0), 
                offset,
                true
            ));
            
            offset += folderData.localFileHeader.length;
        }

        // Add files
        for (const file of this.files) {
            const fileData = this.createFileEntry(file.path, file.content, false);
            zipData.push(fileData.localFileHeader);
            
            centralDirectory.push(this.createCentralDirectoryEntry(
                file.path, 
                file.content, 
                offset,
                false
            ));
            
            offset += fileData.localFileHeader.length;
        }

        // Central directory
        const centralDirStart = offset;
        let centralDirSize = 0;
        
        for (const entry of centralDirectory) {
            zipData.push(entry);
            centralDirSize += entry.length;
        }

        // End of central directory
        const totalEntries = this.folders.size + this.files.length;
        const endOfCentralDir = this.createEndOfCentralDirectory(
            totalEntries, 
            centralDirSize, 
            centralDirStart
        );
        zipData.push(endOfCentralDir);

        // Combine all data
        const totalLength = zipData.reduce((sum, data) => sum + data.length, 0);
        const result = new Uint8Array(totalLength);
        let pos = 0;
        
        for (const data of zipData) {
            result.set(data, pos);
            pos += data.length;
        }

        return new Blob([result], { type: options.mimeType || 'application/zip' });
    }

    createFileEntry(filename, content, isFolder) {
        const nameBytes = new TextEncoder().encode(filename);
        const crc32 = isFolder ? 0 : this.calculateCRC32(content);
        
        // Local file header
        const header = new Uint8Array(30 + nameBytes.length + content.length);
        const view = new DataView(header.buffer);
        
        // Local file header signature
        view.setUint32(0, 0x04034b50, true);
        // Version needed to extract
        view.setUint16(4, 20, true);
        // General purpose bit flag
        view.setUint16(6, 0, true);
        // Compression method (0 = no compression)
        view.setUint16(8, 0, true);
        // File last modification time
        view.setUint16(10, 0, true);
        // File last modification date
        view.setUint16(12, 0, true);
        // CRC-32
        view.setUint32(14, crc32, true);
        // Compressed size
        view.setUint32(18, content.length, true);
        // Uncompressed size
        view.setUint32(22, content.length, true);
        // File name length
        view.setUint16(26, nameBytes.length, true);
        // Extra field length
        view.setUint16(28, 0, true);
        
        // File name
        header.set(nameBytes, 30);
        // File content
        if (content.length > 0) {
            header.set(content, 30 + nameBytes.length);
        }
        
        return { localFileHeader: header };
    }

    createCentralDirectoryEntry(filename, content, offset, isFolder) {
        const nameBytes = new TextEncoder().encode(filename);
        const crc32 = isFolder ? 0 : this.calculateCRC32(content);
        
        const entry = new Uint8Array(46 + nameBytes.length);
        const view = new DataView(entry.buffer);
        
        // Central directory file header signature
        view.setUint32(0, 0x02014b50, true);
        // Version made by
        view.setUint16(4, 20, true);
        // Version needed to extract
        view.setUint16(6, 20, true);
        // General purpose bit flag
        view.setUint16(8, 0, true);
        // Compression method
        view.setUint16(10, 0, true);
        // File last modification time
        view.setUint16(12, 0, true);
        // File last modification date
        view.setUint16(14, 0, true);
        // CRC-32
        view.setUint32(16, crc32, true);
        // Compressed size
        view.setUint32(20, content.length, true);
        // Uncompressed size
        view.setUint32(24, content.length, true);
        // File name length
        view.setUint16(28, nameBytes.length, true);
        // Extra field length
        view.setUint16(30, 0, true);
        // File comment length
        view.setUint16(32, 0, true);
        // Disk number where file starts
        view.setUint16(34, 0, true);
        // Internal file attributes
        view.setUint16(36, 0, true);
        // External file attributes
        view.setUint32(38, isFolder ? 0x10 : 0x20, true);
        // Relative offset of local file header
        view.setUint32(42, offset, true);
        
        // File name
        entry.set(nameBytes, 46);
        
        return entry;
    }

    createEndOfCentralDirectory(totalEntries, centralDirSize, centralDirStart) {
        const entry = new Uint8Array(22);
        const view = new DataView(entry.buffer);
        
        // End of central directory signature
        view.setUint32(0, 0x06054b50, true);
        // Number of this disk
        view.setUint16(4, 0, true);
        // Disk where central directory starts
        view.setUint16(6, 0, true);
        // Number of central directory records on this disk
        view.setUint16(8, totalEntries, true);
        // Total number of central directory records
        view.setUint16(10, totalEntries, true);
        // Size of central directory
        view.setUint32(12, centralDirSize, true);
        // Offset of start of central directory
        view.setUint32(16, centralDirStart, true);
        // Comment length
        view.setUint16(20, 0, true);
        
        return entry;
    }

    calculateCRC32(data) {
        // Simple CRC32 implementation
        let crc = 0xFFFFFFFF;
        const table = this.getCRC32Table();
        
        for (let i = 0; i < data.length; i++) {
            const byte = data[i];
            crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xFF];
        }
        
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    getCRC32Table() {
        if (!this._crc32Table) {
            this._crc32Table = new Uint32Array(256);
            for (let i = 0; i < 256; i++) {
                let crc = i;
                for (let j = 0; j < 8; j++) {
                    crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
                }
                this._crc32Table[i] = crc;
            }
        }
        return this._crc32Table;
    }
}

// Export for use in service worker
if (typeof self !== 'undefined' && self.importScripts) {
    self.SimpleZip = SimpleZip;
} 