import React, { useState, useEffect } from 'react'
import { Box, Container, Snackbar, Alert, IconButton, CssBaseline, Fab, Paper, CircularProgress, Typography, Tooltip } from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import MenuIcon from '@mui/icons-material/Menu'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import Sidebar from './components/Sidebar'
import ImageGallery from './components/ImageGallery'
import SettingsModal from './components/SettingsModal'
import { generateRandomSeed, generateImage, loadSettings, saveSettings } from './services/api'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [images, setImages] = useState([])
  const [favorites, setFavorites] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [requestQueue, setRequestQueue] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState({ apiBaseUrl: '', timeout: 5 })
  const [newImageId, setNewImageId] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  // Load settings and favorites from localStorage on initial load
  useEffect(() => {
    // Load settings
    const savedSettings = loadSettings()
    setSettings(savedSettings)
    
    // Load favorites
    const savedFavorites = localStorage.getItem('favorites')
    if (savedFavorites) {
      setFavorites(JSON.parse(savedFavorites))
    }
  }, [])

  // Save favorites to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('favorites', JSON.stringify(favorites))
  }, [favorites])

  // Clear new image highlight after 2 seconds
  useEffect(() => {
    if (newImageId) {
      const timer = setTimeout(() => {
        setNewImageId(null)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [newImageId])

  // Process the request queue
  useEffect(() => {
    const processNextRequest = async () => {
      if (requestQueue.length > 0 && !isProcessing) {
        setIsProcessing(true)
        const nextRequest = requestQueue[0]
        
        try {
          setIsLoading(true)
          const result = await generateImage(
            nextRequest, 
            settings.apiBaseUrl, 
            settings.timeout
          )
          
          // Create a new image object with the response data
          const newImageId = Date.now().toString()
          const newImage = {
            id: newImageId,
            url: result.imageUrl || 'https://picsum.photos/512/512', // Fallback for testing
            prompt: nextRequest.prompt,
            negative_prompt: nextRequest.negative_prompt,
            num_inference_steps: nextRequest.num_inference_steps,
            guidance_scale: nextRequest.guidance_scale,
            seed: nextRequest.seed,
            timestamp: new Date().toISOString(),
            isFavorite: false
          }
          
          // Set the new image ID for animation
          setNewImageId(newImageId)
          
          // Add the new image to the beginning of the array
          setImages(prevImages => {
            const updatedImages = [newImage, ...prevImages]
            
            // Filter out non-favorite images if we're over the limit
            if (updatedImages.length > 100) {
              return updatedImages.filter((img, index) => 
                index < 100 || img.isFavorite
              )
            }
            
            return updatedImages
          })
        } catch (err) {
          console.error('Error generating image:', err)
          setError(`Failed to generate image: ${err.message}`)
        } finally {
          setIsLoading(false)
          // Remove the processed request from the queue
          setRequestQueue(prev => prev.slice(1))
          setIsProcessing(false)
        }
      }
    }

    processNextRequest()
  }, [requestQueue, isProcessing, settings.apiBaseUrl, settings.timeout])

  const handleGenerateImage = async (params) => {
    // For multiple images, add multiple requests to the queue
    const numImages = params.num_images_per_prompt || 1
    const newRequests = []
    
    for (let i = 0; i < numImages; i++) {
      // Generate a different seed for each image if not specified
      const requestParams = { 
        ...params,
        // Always set num_images_per_prompt to 1 regardless of the slider value
        num_images_per_prompt: 1,
        seed: params.seed === '' ? generateRandomSeed() : params.seed + i
      }
      newRequests.push(requestParams)
    }
    
    // Add the new requests to the queue
    setRequestQueue(prev => [...prev, ...newRequests])
  }

  const toggleFavorite = (imageId) => {
    setImages(prevImages => 
      prevImages.map(img => {
        if (img.id === imageId) {
          const updatedImg = { ...img, isFavorite: !img.isFavorite }
          
          // Update favorites list
          if (updatedImg.isFavorite) {
            setFavorites(prev => [...prev, updatedImg])
          } else {
            setFavorites(prev => prev.filter(fav => fav.id !== imageId))
          }
          
          return updatedImg
        }
        return img
      })
    )
  }

  const handleClearImages = () => {
    // Keep only favorite images
    const favoriteImages = images.filter(img => img.isFavorite)
    setImages(favoriteImages)
    
    // Show success message
    setSuccessMessage("Non-favorite images cleared successfully")
    
    // Hide success message after 3 seconds
    setTimeout(() => {
      setSuccessMessage(null)
    }, 3000)
  }

  const handleCloseError = () => {
    setError(null)
  }

  const handleCloseSuccess = () => {
    setSuccessMessage(null)
  }

  const handleOpenSettings = () => {
    setSettingsOpen(true)
  }

  const handleCloseSettings = () => {
    setSettingsOpen(false)
  }

  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings)
    saveSettings(newSettings)
  }

  return (
    <>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar 
          open={sidebarOpen} 
          setOpen={setSidebarOpen}
          onGenerate={handleGenerateImage}
          isLoading={isLoading || requestQueue.length > 0}
          settings={settings}
        />
        
        {/* Hamburger menu button - only visible when sidebar is closed */}
        {!sidebarOpen && (
          <Fab
            color="primary"
            aria-label="open sidebar"
            onClick={() => setSidebarOpen(true)}
            sx={{
              position: 'fixed',
              top: 16,
              left: 16,
              zIndex: 1200,
            }}
            size="medium"
          >
            <MenuIcon />
          </Fab>
        )}
        
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            width: { sm: `calc(100% - ${sidebarOpen ? 300 : 0}px)` },
            ml: { sm: `${sidebarOpen ? 300 : 0}px` },
            transition: theme => theme.transitions.create(['margin', 'width'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
            height: '100vh',
            overflow: 'hidden', // Prevent main container from scrolling
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 1 }}>
            <Tooltip title="Clear non-favorite images">
              <IconButton 
                onClick={handleClearImages}
                color="primary"
                sx={{ 
                  backgroundColor: 'rgba(0, 0, 0, 0.04)',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.08)',
                  }
                }}
              >
                <DeleteSweepIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Settings">
              <IconButton 
                onClick={handleOpenSettings}
                color="primary"
                sx={{ 
                  backgroundColor: 'rgba(0, 0, 0, 0.04)',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.08)',
                  }
                }}
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Box>
          
          <Container 
            maxWidth="xl" 
            sx={{ 
              height: 'calc(100vh - 80px)', // Adjust for header and padding
              overflow: 'hidden' // Container shouldn't scroll
            }}
          >
            <ImageGallery 
              images={images} 
              toggleFavorite={toggleFavorite} 
              newImageId={newImageId}
            />
          </Container>
        </Box>
        
        {/* Floating notification for image generation */}
        {(isLoading || requestQueue.length > 0) && (
          <Paper
            elevation={3}
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 9999, // Ensure it's on top of everything
              p: 2,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
              backdropFilter: 'blur(10px)',
              animation: 'fadeIn 0.3s ease-out',
              '@keyframes fadeIn': {
                '0%': {
                  opacity: 0,
                  transform: 'translateY(20px)'
                },
                '100%': {
                  opacity: 1,
                  transform: 'translateY(0)'
                }
              }
            }}
          >
            <CircularProgress size={24} sx={{ mr: 2, color: 'primary.main' }} />
            <Typography>
              Generating image{requestQueue.length > 1 ? `s (${requestQueue.length} remaining)` : ''}...
            </Typography>
          </Paper>
        )}
        
        <Snackbar 
          open={!!error} 
          autoHideDuration={6000} 
          onClose={handleCloseError}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={handleCloseError} severity="error" sx={{ width: '100%' }}>
            {error}
          </Alert>
        </Snackbar>
        
        <Snackbar 
          open={!!successMessage} 
          autoHideDuration={3000} 
          onClose={handleCloseSuccess}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={handleCloseSuccess} severity="success" sx={{ width: '100%' }}>
            {successMessage}
          </Alert>
        </Snackbar>
        
        <SettingsModal 
          open={settingsOpen}
          onClose={handleCloseSettings}
          settings={settings}
          onSave={handleSaveSettings}
        />
      </Box>
    </>
  )
}

export default App
