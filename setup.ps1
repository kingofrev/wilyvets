# Nassau Setup Script
# Run this to set up the project

$env:Path = "C:\Program Files\nodejs;C:\Users\lukeb\AppData\Roaming\npm;" + $env:Path

Write-Host "Installing dependencies..." -ForegroundColor Green
npm install

Write-Host "Creating database..." -ForegroundColor Green
# Create the nassau database if it doesn't exist
$env:PGPASSWORD = "postgres"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE nassau;" 2>$null

Write-Host "Pushing database schema..." -ForegroundColor Green
npx prisma db push

Write-Host "Generating Prisma client..." -ForegroundColor Green
npx prisma generate

Write-Host ""
Write-Host "Setup complete! Run 'npm run dev' to start the development server." -ForegroundColor Green
