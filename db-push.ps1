$env:Path = "C:\Program Files\nodejs;C:\Users\lukeb\AppData\Roaming\npm;" + $env:Path
Set-Location "C:\Users\lukeb\nassau"
npx prisma db push
