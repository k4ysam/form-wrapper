# trigger-api.ps1
# Sends a POST /run request to the local API server with optional variable overrides.
# The server must be running first: npm run server
#
# Usage:
#   .\trigger-api.ps1                                          # run with all defaults
#   .\trigger-api.ps1 -firstName Samuel -lastName Kalt          # override name
#   .\trigger-api.ps1 -firstName Samuel -medicalId 99999         # any combination of fields

param(
    [string]$firstName,
    [string]$lastName,
    [string]$dateOfBirth,
    [string]$medicalId,
    [string]$gender,
    [string]$bloodType,
    [string]$allergies,
    [string]$medications,
    [string]$emergencyContact,
    [string]$emergencyPhone,
    [string]$port = "3000"
)

$body = @{}
if ($firstName)        { $body.firstName        = $firstName }
if ($lastName)         { $body.lastName         = $lastName }
if ($dateOfBirth)      { $body.dateOfBirth      = $dateOfBirth }
if ($medicalId)        { $body.medicalId        = $medicalId }
if ($gender)           { $body.gender           = $gender }
if ($bloodType)        { $body.bloodType        = $bloodType }
if ($allergies)        { $body.allergies        = $allergies }
if ($medications)      { $body.medications      = $medications }
if ($emergencyContact) { $body.emergencyContact = $emergencyContact }
if ($emergencyPhone)   { $body.emergencyPhone   = $emergencyPhone }

$json = $body | ConvertTo-Json
$uri  = "http://localhost:$port/run"

if ($body.Count -eq 0) {
    Write-Host "[trigger-api] No overrides - running with default SOP values."
} else {
    Write-Host "[trigger-api] Overrides: $json"
}

$response = Invoke-WebRequest -Uri $uri -Method POST -ContentType "application/json" -Body $json
Write-Host "[trigger-api] Response ($($response.StatusCode)):"
$response.Content | ConvertFrom-Json | ConvertTo-Json

# example: 
# .\trigger-api.ps1 -firstName Samuel -dateOfBirth 2020-01-15 