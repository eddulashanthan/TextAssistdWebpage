# TextAssistd API Documentation

## Test Accounts for E2E and Integration

> **Note:** For all E2E and integration testing, use the following test accounts:
>
> - **licensed@example.com** (active license)
>   - License Key: `test-licensed-key-1`
>   - Password: `Test1234`
> - **nolicense@example.com** (expired license)
>   - License Key: `test-expired-key-2`
>   - Password: `Test1234`

All example requests below use these accounts and license keys.

## Overview
This document outlines the API endpoints and integration requirements for the TextAssistd macOS application. The API provides functionality for license validation, usage tracking, and user management.

## Base URL
- Development: `http://localhost:3000/api`
- Production: `https://textassistd.com/api`

## Authentication
All API requests must include a valid license key in the request headers:

```
Authorization: Bearer <license_key>
```

## API Endpoints

### License Validation

#### Validate License
```http
POST /licenses/validate
```

Validates a license key and associates it with a system ID.

**Request Body:**
```json
{
  "licenseKey": "test-licensed-key-1",
  "systemId": "your-system-id"
}
```

**Response:**
```json
{
  "valid": true,
  "message": "License validated successfully",
  "license": {
    "hoursRemaining": 100,
    "status": "active",
    "lastValidatedAt": "2025-05-06T12:00:00Z"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Missing or invalid parameters
- `403 Forbidden`: License expired or revoked
- `404 Not Found`: Invalid license key

### Usage Tracking

#### Track Usage
```http
POST /licenses/track-usage
```

Records usage time for a license.

**Request Body:**
```json
{
  "minutes": 30
}
```

**Response:**
```json
{
  "success": true,
  "hoursRemaining": 9.5
}
```

**Error Responses:**
- `400 Bad Request`: Invalid parameters
- `403 Forbidden`: Insufficient hours remaining
- `404 Not Found`: License not found

## Implementation Guide

### System ID Generation
The macOS app should generate a unique system ID using the following components:
1. Hardware UUID
2. Mac address of primary network interface
3. Drive serial number

Example implementation in Swift:
```swift
func generateSystemId() -> String {
    let hardware = IOServiceMatching("IOPlatformExpertDevice")
    let platformExpert = IOServiceGetMatchingService(kIOMainPortDefault, hardware)
    
    var serialNumberAsCFString: CFTypeRef?
    IORegistryEntryCreateCFProperty(
        platformExpert, 
        "IOPlatformSerialNumber" as CFString, 
        kCFAllocatorDefault, 
        0
    )
    
    let serialNumber = serialNumberAsCFString as? String ?? ""
    let macAddress = getMacAddress() // Implement this to get MAC address
    let driveSerial = getDriveSerial() // Implement this to get drive serial
    
    let combined = "\(serialNumber):\(macAddress):\(driveSerial)"
    return SHA256.hash(data: combined.data(using: .utf8)!).hex
}
```

### Offline Support
The app should implement the following offline handling strategy:

1. Cache the last successful license validation response
2. Store usage data locally when offline
3. Implement retry mechanism with exponential backoff
4. Sync usage data when connection is restored

Example offline storage structure:
```swift
struct CachedLicense {
    let key: String
    let validUntil: Date
    let hoursRemaining: Double
    let lastValidatedAt: Date
}

struct UsageRecord {
    let timestamp: Date
    let minutesUsed: Int
    let synced: Bool
}
```

### Error Handling

Implement proper error handling for various scenarios:

1. Network errors
```swift
enum NetworkError: Error {
    case noConnection
    case timeout
    case serverError(String)
}
```

2. License errors
```swift
enum LicenseError: Error {
    case invalid
    case expired
    case insufficientHours
    case activationLimit
}
```

3. Validation errors
```swift
enum ValidationError: Error {
    case invalidSystemId
    case tampered
    case clockManipulation
}
```

### Usage Tracking Implementation

Track usage in regular intervals:

```swift
class UsageTracker {
    private let interval: TimeInterval = 300 // 5 minutes
    private var timer: Timer?
    private var accumulator: TimeInterval = 0
    
    func startTracking() {
        timer = Timer.scheduledTimer(
            withTimeInterval: interval,
            repeats: true
        ) { [weak self] _ in
            self?.reportUsage()
        }
    }
    
    private func reportUsage() {
        let minutes = Int(accumulator / 60)
        if minutes > 0 {
            api.trackUsage(minutes: minutes) { result in
                switch result {
                case .success:
                    self.accumulator = 0
                case .failure(let error):
                    self.handleError(error)
                }
            }
        }
    }
}
```

## Best Practices

1. **Security**
   - Always use HTTPS for API communication
   - Implement certificate pinning
   - Encrypt cached license data
   - Validate response signatures

2. **Performance**
   - Implement request caching
   - Use compression for network requests
   - Batch usage reports when possible
   - Implement request queuing

3. **Reliability**
   - Implement retry logic with backoff
   - Cache necessary data for offline use
   - Validate system clock
   - Monitor for tampering attempts

## Rate Limits

- License validation: 6 requests per hour
- Usage tracking: 30 requests per hour
- All other endpoints: 100 requests per hour

## Examples

### Swift API Client Implementation

```swift
class TextAssistdAPI {
    private let baseURL: URL
    private let licenseKey: String
    
    func validateLicense(systemId: String) async throws -> LicenseValidation {
        let url = baseURL.appendingPathComponent("licenses/validate")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(licenseKey)", forHTTPHeaderField: "Authorization")
        
        let body = [
            "licenseKey": licenseKey,
            "systemId": systemId
        ]
        request.httpBody = try JSONEncoder().encode(body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.invalidResponse
        }
        
        return try JSONDecoder().decode(LicenseValidation.self, from: data)
    }
    
    func trackUsage(minutes: Int) async throws -> UsageResponse {
        let url = baseURL.appendingPathComponent("licenses/track-usage")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(licenseKey)", forHTTPHeaderField: "Authorization")
        
        let body = [
            "licenseId": licenseKey,
            "minutesUsed": minutes
        ]
        request.httpBody = try JSONEncoder().encode(body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.invalidResponse
        }
        
        return try JSONDecoder().decode(UsageResponse.self, from: data)
    }
}
```

## Support

For API support and questions, contact:
- Email: api-support@textassistd.com
- Developer Portal: https://developers.textassistd.com
- API Status: https://status.textassistd.com

> **UI/UX Note (June 2025):**
> - The dashboard now displays the license key with a copy button and visibility toggle for user convenience.
> - After logout, users are redirected to the main page and shown a "Successfully logged out." message.
> - For optimal performance, the logout message logic can be moved to a small client component if desired.