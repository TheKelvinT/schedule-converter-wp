import React, { useState } from 'react';
import { Upload, Download, FileSpreadsheet, AlertCircle, Bus, Clock, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import * as XLSX from 'xlsx';

const BusScheduleConverter = () => {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const handleFileUpload = (event) => {
    const uploadedFile = event.target.files[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setError(null);
      setResults(null);
      setPreviewData(null);
      setShowPreview(false);
    }
  };

  const parseTime = (timeStr) => {
    if (!timeStr) return null;
    
    const timeString = String(timeStr).trim();
    
    // PRIORITY 1: Excel serial number (MUST BE FIRST to avoid regex conflicts)
    const numValue = parseFloat(timeString);
    if (!isNaN(numValue) && numValue > 0 && numValue < 1) {
      // Excel time serial number (fraction of a day)
      const totalMinutes = Math.round(numValue * 24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      
      console.log(`✅ Excel serial: ${numValue} -> ${hours}:${String(minutes).padStart(2, '0')}`);
      return new Date(2023, 0, 1, hours, minutes);
    }
    
    // PRIORITY 2: Handle single digit hours (e.g., "6" for 6:00)
    if (timeString.match(/^[5-9]$/) || timeString.match(/^1[0-9]$/) || timeString.match(/^2[0-3]$/) ) {
      const hours = parseInt(timeString);
      if (hours >= 5 && hours <= 23) {
        console.log(`✅ Single digit hour: ${hours}:00`);
        return new Date(2023, 0, 1, hours, 0);
      }
    }
    
    // PRIORITY 3: Colon formats "7:00", "07:00", "7.00", "07.00"
    let timeMatch = timeString.match(/^(\d{1,2})[:.:](\d{2})$/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      return new Date(2023, 0, 1, hours, minutes);
    }
    
    // Format 3: Just numbers like "700" for "7:00"
    if (timeString.match(/^\d{3,4}$/)) {
      const timeNum = parseInt(timeString);
      if (timeNum >= 600 && timeNum <= 2359) {
        const hours = Math.floor(timeNum / 100);
        const minutes = timeNum % 100;
        if (minutes < 60) {
          return new Date(2023, 0, 1, hours, minutes);
        }
      }
    }
    
    return null;
  };

  const testTimeValidation = (testValues) => {
    const results = testValues.map(value => {
      const timeString = String(value).trim();
      const result = {
        input: value,
        inputType: typeof value,
        stringValue: timeString,
        parsed: null,
        passesFilter: false,
        formatUsed: null,
        details: {}
      };

      // Test Format 1: "7:00", "07:00", "7.00", "07.00"
      let timeMatch = timeString.match(/^(\d{1,2})[:.:](\d{2})$/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        result.parsed = `${hours}:${String(minutes).padStart(2, '0')}`;
        result.passesFilter = hours >= 5;
        result.formatUsed = 'Format1_ColonTime';
        result.details = { hours, minutes, regex: 'matched' };
        return result;
      }

      // Test Format 2: Excel serial number
      const numValue = parseFloat(timeString);
      if (!isNaN(numValue) && numValue > 0 && numValue < 1) {
        const totalMinutes = Math.round(numValue * 24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        result.parsed = `${hours}:${String(minutes).padStart(2, '0')}`;
        result.passesFilter = hours >= 5;
        result.formatUsed = 'Format2_ExcelSerial';
        result.details = { serialNumber: numValue, totalMinutes, hours, minutes };
        return result;
      }

      // Test Format 3: Numeric like "600", "700"
      if (timeString.match(/^\d{3,4}$/)) {
        const timeNum = parseInt(timeString);
        if (timeNum >= 600 && timeNum <= 2359) {
          const hours = Math.floor(timeNum / 100);
          const minutes = timeNum % 100;
          if (minutes < 60) {
            result.parsed = `${hours}:${String(minutes).padStart(2, '0')}`;
            result.passesFilter = hours >= 5;
            result.formatUsed = 'Format3_Numeric';
            result.details = { numericValue: timeNum, hours, minutes };
            return result;
          } else {
            result.formatUsed = 'Format3_Numeric_InvalidMinutes';
            result.details = { numericValue: timeNum, invalidMinutes: minutes };
          }
        } else {
          result.formatUsed = 'Format3_Numeric_OutOfRange';
          result.details = { numericValue: timeNum, range: '600-2359' };
        }
        return result;
      }

      result.formatUsed = 'NoMatch';
      result.details = { 
        isNumber: !isNaN(numValue),
        numberValue: numValue,
        regexTests: {
          colonFormat: !!timeString.match(/^(\d{1,2})[:.:](\d{2})$/),
          numericFormat: !!timeString.match(/^\d{3,4}$/)
        }
      };
      return result;
    });

    return results;
  };

  // Expose the test function globally for debugging
  window.testTimeValidation = testTimeValidation;

  const formatTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Simplified debugging - only for missing 6:00
  const debugAllData = (data, timeColumns, headerRowIndex) => {
    console.log('\n🔍 LOOKING FOR MISSING 6:00 ENTRY...');
    
    // Only check Orchard Hotel columns for 6:00 values
    for (let i = headerRowIndex + 1; i < Math.min(headerRowIndex + 10, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      
      timeColumns.forEach(col => {
        if (col.name.toLowerCase().includes('orchard')) {
          const rawValue = row[col.colIndex];
          if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
            const str = String(rawValue).trim();
            
                         // Only log if it looks like it could be 6:00
             if (str === '6' || str === '6:00' || str === '6.00' || str === '600' || 
                 parseFloat(str) === 0.25 || str.includes('6:')) {
               console.log(`🎯 FOUND POTENTIAL 6:00 in Row ${i}, ${col.name}: "${rawValue}" (type: ${typeof rawValue})`);
               
               // Manual calculation check
               if (parseFloat(str) === 0.25) {
                 const totalMins = Math.round(0.25 * 24 * 60);
                 const hrs = Math.floor(totalMins / 60);
                 const mins = totalMins % 60;
                 console.log(`   Manual calc: 0.25 * 24 * 60 = ${totalMins} mins = ${hrs}:${String(mins).padStart(2, '0')}`);
               }
               
               const parsed = parseTime(rawValue);
               console.log(`   Parsed as: ${parsed ? formatTime(parsed) : 'FAILED TO PARSE'}`);
               console.log(`   Hours: ${parsed ? parsed.getHours() : 'N/A'}, Minutes: ${parsed ? parsed.getMinutes() : 'N/A'}`);
             }
          }
        }
      });
    }
  };


  const processScheduleData = (workbook) => {
    let hotelDepartures = [];
    let wchDepartures = [];
    let combinedSchedule = [];
    let sheetSummary = [];

    try {
      console.log('Total sheets found:', workbook.SheetNames.length);
      console.log('Sheet names:', workbook.SheetNames);

      // Process each sheet
      workbook.SheetNames.forEach((sheetName, sheetIndex) => {
        console.log(`\n=== Processing sheet ${sheetIndex + 1}: ${sheetName} ===`);
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        console.log('Sheet data rows:', data.length);
        if (data.length < 2) {
          console.log('Sheet has insufficient data, skipping');
          sheetSummary.push({
            name: sheetName,
            status: 'Skipped - insufficient data',
            rowsProcessed: 0
          });
          return;
        }

        let sheetHotelDepartures = [];
        let sheetWchDepartures = [];

        // STEP 1: Find the header row and identify columns
        let headerRow = null;
        let headerRowIndex = -1;
        let timeColumns = []; // [{ name: "Hotel Name", colIndex: 2 }]
        let destinationColIndex = -1;
        let busNoColIndex = -1;
        let busDetailsColIndex = -1;

        // Look for header row (contains hotel names and destination)
        for (let i = 0; i < Math.min(10, data.length); i++) {
          const row = data[i];
          if (!row) continue;
          
          console.log(`🔍 Checking row ${i} for headers:`, row.slice(0, 10)); // Show first 10 columns
          
          let foundDestination = false;
          let foundHotels = 0;
          
          for (let j = 0; j < row.length; j++) {
            const cellValue = String(row[j] || '').toLowerCase();
            console.log(`  Column ${j}: "${row[j]}" -> "${cellValue}"`);
            
            if (cellValue.includes('wch') || cellValue.includes('arena') || 
                cellValue.includes('sentosa') || cellValue.includes('beach') ||
                cellValue.includes('palawan') || cellValue.includes('destination')) {
              destinationColIndex = j;
              foundDestination = true;
              console.log(`  ✅ Found destination column at ${j}`);
            } else if (cellValue.includes('hotel') || cellValue.includes('amara') || 
                      cellValue.includes('mercure') || cellValue.includes('holiday') ||
                      cellValue.includes('katong') || cellValue.includes('singapore') ||
                      cellValue.includes('ibis') || cellValue.includes('bencoolen') ||
                      cellValue.includes('orchard') || cellValue.includes('copthorne') ||
                      cellValue.includes('furama') || cellValue.includes('aloft') ||
                      cellValue.includes('dorsett') || cellValue.includes('michael')) {
              timeColumns.push({
                name: String(row[j]).trim(),
                colIndex: j
              });
              foundHotels++;
              console.log(`  ✅ Found hotel column at ${j}: ${String(row[j]).trim()}`);
            } else if ((cellValue.includes('bus') && cellValue.includes('no')) || 
                      cellValue === 'bus no' || cellValue.includes('bus number')) {
              busNoColIndex = j;
              console.log(`  ✅ Found bus no column at ${j}`);
            } else if ((cellValue.includes('bus') && cellValue.includes('detail')) ||
                      cellValue === 'bus details' || cellValue.includes('driver') ||
                      cellValue.includes('license') || cellValue.includes('plate')) {
              busDetailsColIndex = j;
              console.log(`  ✅ Found bus details column at ${j}`);
            }
          }
          
          console.log(`Row ${i} summary: foundDestination=${foundDestination}, foundHotels=${foundHotels}`);
          
          // Relaxed requirement: Just need hotels (1+ if has destination, 2+ if no destination)
          // OR if we find common header patterns
          const hasCommonHeaders = row.some(cell => {
            const cellStr = String(cell || '').toLowerCase();
            return cellStr.includes('departure time') || cellStr.includes('pickup') || cellStr.includes('drop');
          });
          
          if ((foundDestination && foundHotels >= 1) || (!foundDestination && foundHotels >= 2) || 
              (foundHotels >= 1 && hasCommonHeaders)) {
            headerRow = row;
            headerRowIndex = i;
            console.log(`Found header at row ${i}:`);
            console.log('Time columns detected:', timeColumns.map(col => `"${col.name}" at index ${col.colIndex}`));
            console.log('Destination column:', destinationColIndex);
            console.log('Bus No column:', busNoColIndex);
            console.log('Bus Details column:', busDetailsColIndex);
            
            // Call comprehensive debugging
            debugAllData(data, timeColumns, headerRowIndex);
            
            break;
          }
        }

        if (!headerRow) {
          console.log('No valid header found, skipping sheet');
          sheetSummary.push({
            name: sheetName,
            status: 'No header found',
            rowsProcessed: 0
          });
          return;
        }

        // STEP 2: Process data rows
        let currentBusInfo = { busNo: '', driver: '', licensePlate: '' };
        
        for (let rowIndex = headerRowIndex + 1; rowIndex < data.length; rowIndex++) {
          const row = data[rowIndex];
          if (!row) continue;
          

          
          // Extract times for each hotel column
          const times = {};
          let hasValidTimes = false;
          
          timeColumns.forEach(col => {
            const rawValue = row[col.colIndex];
            const timeValue = parseTime(rawValue);
            
            // Only log 6:00 times when found
            if (timeValue && timeValue.getHours() === 6 && timeValue.getMinutes() === 0) {
              console.log(`🎯 FOUND 6:00! ${col.name}: "${rawValue}" -> ${formatTime(timeValue)}`);
            }
            
            if (timeValue && timeValue.getHours() >= 5) { // Filter 5am+
              times[col.name] = timeValue;
              hasValidTimes = true;
            }
          });
          
          // Extract destination time
          const rawDestinationValue = destinationColIndex !== -1 ? row[destinationColIndex] : null;
          const destinationTime = rawDestinationValue ? parseTime(rawDestinationValue) : null;
          const validDestinationTime = destinationTime && destinationTime.getHours() >= 5 ? destinationTime : null;
          
          if (!hasValidTimes) {
            continue;
          }
          
          // STEP 3: Extract bus information (handle merged cells)
          let busNo = '';
          let driver = '';
          let licensePlate = '';
          
          console.log(`🚌 Bus extraction - Row ${rowIndex}: busNoCol=${busNoColIndex}, busDetailsCol=${busDetailsColIndex}`);
          
          // Try current row first
          if (busNoColIndex !== -1 && row[busNoColIndex]) {
            busNo = String(row[busNoColIndex]).trim();
            console.log(`  Found bus no: "${busNo}"`);
          }
          
          if (busDetailsColIndex !== -1 && row[busDetailsColIndex]) {
            const details = String(row[busDetailsColIndex]).trim();
            console.log(`  Found bus details: "${details}"`);
            if (details && details !== '') {
              // Parse driver and license from details
              const result = parseDriverAndLicense(details);
              driver = result.driver;
              licensePlate = result.licensePlate;
              console.log(`  Parsed - Driver: "${driver}", License: "${licensePlate}"`);
            }
          }
          
          // If no bus info in current row, look backward (merged cells)
          if (!busNo || !driver || !licensePlate) {
            for (let lookBack = rowIndex - 1; lookBack >= headerRowIndex + 1 && lookBack >= rowIndex - 20; lookBack--) {
              const prevRow = data[lookBack];
              if (!prevRow) continue;
              
              if (!busNo && busNoColIndex !== -1 && prevRow[busNoColIndex]) {
                const prevBusNo = String(prevRow[busNoColIndex]).trim();
                if (prevBusNo && prevBusNo !== '') {
                  busNo = prevBusNo;
                }
              }
              
              if ((!driver || !licensePlate) && busDetailsColIndex !== -1 && prevRow[busDetailsColIndex]) {
                const prevDetails = String(prevRow[busDetailsColIndex]).trim();
                if (prevDetails && prevDetails !== '') {
                  const result = parseDriverAndLicense(prevDetails);
                  if (!driver && result.driver) driver = result.driver;
                  if (!licensePlate && result.licensePlate) licensePlate = result.licensePlate;
                }
              }
              
              if (busNo && driver && licensePlate) break;
            }
          }
          
          // Update current bus info for this group
          if (busNo) currentBusInfo.busNo = busNo;
          if (driver) currentBusInfo.driver = driver;
          if (licensePlate) currentBusInfo.licensePlate = licensePlate;
          
          console.log(`Bus info: ${currentBusInfo.busNo} | ${currentBusInfo.driver} | ${currentBusInfo.licensePlate}`);
          
          // STEP 4: Create schedule entries
          Object.keys(times).forEach(hotelName => {
            const departureTime = times[hotelName];
            
            // Clean up hotel name - remove (Pickup Only), 上人, and other unwanted text
            const cleanHotelName = hotelName
              .replace(/\(Pickup Only\)/gi, '')
              .replace(/\(Pick.*?Only\)/gi, '')
              .replace(/上人/g, '')
              .replace(/下人/g, '')
              .replace(/\(Drop.*?Only\)/gi, '')
              .trim();
            
            // Create hotel departure entry
            const hotelEntry = {
              'Time': formatTime(departureTime),
              'Location': cleanHotelName, // Departure hotel name
              'License Plate': currentBusInfo.licensePlate || '',
              'Driver': currentBusInfo.driver || '',
              'Bus No': currentBusInfo.busNo || ''
            };
            
            sheetHotelDepartures.push(hotelEntry);
            console.log(`✅ Added hotel departure: ${cleanHotelName} at ${formatTime(departureTime)}`);
            
            // Special logging for 6:00 entries
            if (departureTime.getHours() === 6 && departureTime.getMinutes() === 0) {
              console.log(`🎯 ADDED 6:00 DEPARTURE! Hotel: ${cleanHotelName}, Driver: ${currentBusInfo.driver}, License: ${currentBusInfo.licensePlate}`);
            }
          });
          
          // Create destination departure entry (using actual departure time)
          if (validDestinationTime) {
            // For destination departures, show all hotels in the route as destinations
            const availableHotels = Object.keys(times);
            const cleanHotelNames = availableHotels.map(name => 
              name.replace(/\(.*?\)/g, '').replace(/上人|下人/g, '').trim()
            ).filter(name => name.length > 0);
            
            const destinationText = cleanHotelNames.length > 0 ? 
              cleanHotelNames.join(' & ') : 
              'Hotels';
            
            const destinationEntry = {
              'Time': formatTime(validDestinationTime), // Use actual destination time, not calculated
              'Location': destinationText, // Multiple destinations
              'License Plate': currentBusInfo.licensePlate || '',
              'Driver': currentBusInfo.driver || '',
              'Bus No': currentBusInfo.busNo || ''
            };
            
            sheetWchDepartures.push(destinationEntry);
            console.log(`✅ Added destination departure: at ${formatTime(validDestinationTime)} to ${destinationText}`);
          }
        }
        
        console.log(`Sheet ${sheetName}: Found ${sheetHotelDepartures.length} hotel departures, ${sheetWchDepartures.length} WCH departures`);
        
        // Add to overall results
        hotelDepartures = hotelDepartures.concat(sheetHotelDepartures);
        wchDepartures = wchDepartures.concat(sheetWchDepartures);
        
        sheetSummary.push({
          name: sheetName,
          status: sheetHotelDepartures.length > 0 || sheetWchDepartures.length > 0 ? 'Processed' : 'No schedules found',
          rowsProcessed: data.length,
          hotelDepartures: sheetHotelDepartures.length,
          wchDepartures: sheetWchDepartures.length
        });
      });

      // Sort function for time (5am to 4:59am cycle)
      const sortByTime = (a, b) => {
        const timeA = a.Time || '00:00';
        const timeB = b.Time || '00:00';
        
        const [hoursA, minsA] = timeA.split(':').map(Number);
        const [hoursB, minsB] = timeB.split(':').map(Number);
        
        // Convert to minutes from 5am (5am = 0, 6am = 60, ... 4am = 1380, 4:59am = 1439)
        const getMinutesFrom5am = (hours, minutes) => {
          if (hours >= 5) {
            return (hours - 5) * 60 + minutes;
          } else {
            return (hours + 19) * 60 + minutes; // 4am = 23 hours after 5am
          }
        };
        
        const totalMinsA = getMinutesFrom5am(hoursA, minsA);
        const totalMinsB = getMinutesFrom5am(hoursB, minsB);
        
        return totalMinsA - totalMinsB;
      };

      // Sort all schedules
      hotelDepartures.sort(sortByTime);
      wchDepartures.sort(sortByTime);
      
      // Create combined schedule
      combinedSchedule = [
        ...hotelDepartures.map(entry => ({ ...entry, 'Departure Type': 'Hotel Departure' })),
        ...wchDepartures.map(entry => ({ ...entry, 'Departure Type': 'WCH Departure' }))
      ].sort(sortByTime);

      console.log('\n=== Final Results ===');
      console.log('Total Hotel Departures:', hotelDepartures.length);
      console.log('Total WCH Departures:', wchDepartures.length);
      console.log('Total Combined Schedule:', combinedSchedule.length);

      return { 
        hotelDepartures, 
        wchDepartures, 
        combinedSchedule,
        sheetSummary,
        totalSheets: workbook.SheetNames.length 
      };
    } catch (err) {
      console.error('Error processing schedule data:', err);
      throw new Error('Failed to process schedule data: ' + err.message);
    }
  };

  // Helper function to parse driver and license plate from details string
  const parseDriverAndLicense = (details) => {
    let driver = '';
    let licensePlate = '';
    
    console.log('Parsing details:', details);
    
    // Strategy 1: Split by newlines
    const lines = details.split(/[\n\r]+/);
    if (lines.length > 1) {
      driver = lines[0]?.trim() || '';
      for (let i = 1; i < lines.length; i++) {
        const licenseMatch = lines[i].match(/([A-Z]{1,3}\d+[A-Z]?)/);
        if (licenseMatch) {
          licensePlate = licenseMatch[1];
          break;
        }
      }
    }
    
    // Strategy 2: Split by spaces if no newlines worked
    if (!driver || !licensePlate) {
      const parts = details.split(/\s+/);
      const driverParts = [];
      
      for (const part of parts) {
        const licenseMatch = part.match(/^([A-Z]{1,3}\d+[A-Z]?)$/);
        if (licenseMatch && !licensePlate) {
          licensePlate = licenseMatch[1];
        } else if (part.trim() && !part.match(/[A-Z]{1,3}\d+[A-Z]?/)) {
          driverParts.push(part.trim());
        }
      }
      
      if (!driver && driverParts.length > 0) {
        driver = driverParts.join(' ');
      }
    }
    
    console.log(`Parsed - Driver: "${driver}", License: "${licensePlate}"`);
    return { driver, licensePlate };
  };

  const processFile = async () => {
    if (!file) return;
    
    setProcessing(true);
    setError(null);
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      
      const schedules = processScheduleData(workbook);
      setResults(schedules);
      setPreviewData(schedules);
      
    } catch (err) {
      setError('Error processing file: ' + err.message);
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const downloadExcel = () => {
    if (!results) return;
    
    const wb = XLSX.utils.book_new();
    
    // Create sheets with headers and data separately to avoid first row being cut off
    const hotelDeparturesWs = XLSX.utils.json_to_sheet(results.hotelDepartures, { header: ['Time', 'Location', 'License Plate', 'Driver', 'Bus No'] });
    const wchDeparturesWs = XLSX.utils.json_to_sheet(results.wchDepartures, { header: ['Time', 'Location', 'License Plate', 'Driver', 'Bus No'] });
    const combinedScheduleWs = XLSX.utils.json_to_sheet(results.combinedSchedule, { header: ['Time', 'Location', 'License Plate', 'Driver', 'Bus No', 'Departure Type'] });
    
    // Add sheets to workbook
    XLSX.utils.book_append_sheet(wb, hotelDeparturesWs, 'Hotel Departures');
    XLSX.utils.book_append_sheet(wb, wchDeparturesWs, 'WCH Departures');
    XLSX.utils.book_append_sheet(wb, combinedScheduleWs, 'Combined Schedule');
    
    // Download file
    XLSX.writeFile(wb, 'converted_bus_schedules.xlsx');
  };

  const PreviewTable = ({ data, title }) => {
    if (!data || data.length === 0) return null;
    
    const columns = Object.keys(data[0]);

  return (
      <div className="mb-6">
        <h4 className="font-semibold text-gray-800 mb-3">{title} ({data.length} entries)</h4>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {columns.map(col => (
                  <th key={col} className="px-3 py-2 text-left font-medium text-gray-700 border-b">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {columns.map(col => (
                    <td key={col} className="px-3 py-2 border-b text-gray-600">
                      {row[col] || '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <FileSpreadsheet className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Bus Schedule Converter</h1>
            <p className="text-gray-600">Convert your bus schedule Excel files to organized format</p>
          </div>

          {/* File Upload */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Excel File (.xlsx/.xls)
            </label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-400">Excel files (.xlsx, .xls)</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                />
              </label>
      </div>
            {file && (
              <p className="text-sm text-gray-600 mt-2">
                Selected: {file.name}
              </p>
            )}
          </div>

          {/* Process Button */}
          <div className="mb-8">
            <button
              onClick={processFile}
              disabled={!file || processing}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {processing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Processing...
                </>
              ) : (
                <>
                  <Eye className="w-5 h-5 mr-2" />
                  Process & Preview
                </>
              )}
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                <span className="text-red-700">{error}</span>
              </div>
            </div>
          )}

          {/* Results Summary */}
          {results && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center">
                <FileSpreadsheet className="w-5 h-5 mr-2" />
                Processing Complete!
              </h3>
              
              {/* Sheet Summary */}
              {results.sheetSummary && (
                <div className="mb-4">
                  <h4 className="font-medium text-gray-700 mb-2">Sheets Processed ({results.totalSheets} total):</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                    {results.sheetSummary.map((sheet, idx) => (
                      <div key={idx} className="bg-white p-2 rounded border">
                        <div className="font-medium">{sheet.name}</div>
                        <div className="text-gray-600">{sheet.status}</div>
                        {sheet.hotelDepartures !== undefined && (
                          <div className="text-blue-600">{sheet.hotelDepartures} hotel departures</div>
                        )}
                        {sheet.wchDepartures !== undefined && (
                          <div className="text-green-600">{sheet.wchDepartures} WCH departures</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg">
                  <h4 className="font-medium text-gray-700 mb-2">Hotel Departures</h4>
                  <p className="text-2xl font-bold text-blue-600">{results.hotelDepartures.length}</p>
                  <p className="text-sm text-gray-500">departure entries</p>
                </div>
                <div className="bg-white p-4 rounded-lg">
                  <h4 className="font-medium text-gray-700 mb-2">WCH Departures</h4>
                  <p className="text-2xl font-bold text-green-600">{results.wchDepartures.length}</p>
                  <p className="text-sm text-gray-500">departure entries</p>
                </div>
              </div>

              {/* Preview Toggle */}
              {previewData && (previewData.hotelDepartures.length > 0 || previewData.wchDepartures.length > 0) && (
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="w-full mb-4 bg-blue-100 text-blue-700 py-2 px-4 rounded-lg font-medium hover:bg-blue-200 transition-colors flex items-center justify-center"
                >
                  {showPreview ? <ChevronUp className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
                  {showPreview ? 'Hide Preview' : 'Show Preview'}
                </button>
              )}
              
              <button
                onClick={downloadExcel}
                className="w-full bg-green-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center"
              >
                <Download className="w-5 h-5 mr-2" />
                Download Converted Excel File
              </button>
            </div>
          )}

          {/* Preview Section */}
          {showPreview && previewData && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Data Preview</h3>
              
              <PreviewTable 
                data={previewData.hotelDepartures} 
                title="Hotel Departures Schedule" 
              />
              
              <PreviewTable 
                data={previewData.wchDepartures} 
                title="WCH Departures Schedule" 
              />

              <PreviewTable 
                data={previewData.combinedSchedule} 
                title="Combined Schedule" 
              />
            </div>
          )}

          {/* Instructions */}
          <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-lg font-semibold text-blue-800 mb-3">Instructions</h3>
            <ul className="space-y-2 text-sm text-blue-700">
              <li>• Upload your Excel file containing bus schedule data (supports multiple tabs)</li>
              <li>• The app will automatically detect and process all tabs in your file</li>
              <li>• Click "Process & Preview" to see detected data before downloading</li>
              <li>• Review the preview to ensure data is correctly parsed</li>
              <li>• Download the converted file with organized "Hotel Departures", "WCH Departures", and "Combined Schedule" sheets</li>
              <li>• Check browser console (F12) for detailed processing information</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusScheduleConverter;
