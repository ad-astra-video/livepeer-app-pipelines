import React, { useState, useEffect, useRef } from 'react'
import { Box, Container, Snackbar, Alert, IconButton, CssBaseline, Fab, Paper, CircularProgress, Typography, Tooltip, useMediaQuery, useTheme } from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import MenuIcon from '@mui/icons-material/Menu'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import Sidebar from './components/Sidebar'
import ImageGallery from './components/ImageGallery'
import SettingsModal from './components/SettingsModal'
import { generateRandomSeed, generateImage, loadSettings, saveSettings } from './services/api'

function App() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile) // Close sidebar by default on mobile
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
  
  // Store the last form data for quick generation
  const lastFormDataRef = useRef({
    prompt: '',
    negative_prompt: '',
    num_inference_steps: 2,
    guidance_scale: 4.5,
    seed: '',
    num_images_per_prompt: 1,
    use_random_seed: true
  })

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
            const limit = isMobile ? 20 : 100; // Reduced limit on mobile
            if (updatedImages.length > limit) {
              return updatedImages.filter((img, index) => 
                index < limit || img.isFavorite
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
  }, [requestQueue, isProcessing, settings.apiBaseUrl, settings.timeout, isMobile])

  const handleGenerateImage = async (params) => {
    // Store the form data for quick generation
    lastFormDataRef.current = { ...params }
    
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

  const handleQuickGenerate = () => {
    // Check if we have a valid prompt
    if (!lastFormDataRef.current.prompt.trim()) {
      setError("Please enter a prompt in the sidebar first")
      return
    }
    
    // Generate a single image using the last form data
    const params = {
      ...lastFormDataRef.current,
      num_images_per_prompt: 1 // Always generate just one image for quick generation
    }
    
    handleGenerateImage(params)
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
        
        {/* Left side buttons - only visible when sidebar is closed */}
        {!sidebarOpen && (
          <Box sx={{ 
            position: 'fixed', 
            top: 16, 
            left: 16, 
            zIndex: 1200,
            display: 'flex',
            gap: 1
          }}>
            {/* Menu button */}
            <Fab
              color="primary"
              aria-label="open sidebar"
              onClick={() => setSidebarOpen(true)}
              size={isMobile ? "small" : "medium"}
            >
              <MenuIcon />
            </Fab>
            
            {/* Quick generate button */}
            <Tooltip title="Quick generate with last settings">
              <Fab
                color="secondary"
                aria-label="quick generate"
                onClick={handleQuickGenerate}
                disabled={isLoading || requestQueue.length > 0}
                size={isMobile ? "small" : "medium"}
              >
                {isLoading || requestQueue.length > 0 ? (
                  <CircularProgress size={isMobile ? 18 : 24} color="inherit" />
                ) : (
                  <AutoFixHighIcon />
                )}
              </Fab>
            </Tooltip>
          </Box>
        )}
        
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: { xs: 1, sm: 3 }, // Reduced padding on mobile even more
            width: { 
              xs: '100%', // Full width on mobile
              sm: `calc(100% - ${sidebarOpen ? 300 : 0}px)` 
            },
            ml: { 
              xs: 0, // No margin on mobile
              sm: `${sidebarOpen ? 300 : 0}px` 
            },
            transition: theme => theme.transitions.create(['margin', 'width'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
            height: '100vh',
            overflow: 'hidden', // Prevent main container from scrolling
            display: 'flex', // Use flexbox
            flexDirection: 'column', // Stack children vertically
          }}
        >
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            mb: { xs: 1, sm: 2 }, 
            gap: 1,
            position: isMobile ? 'absolute' : 'relative',
            top: isMobile ? 16 : 'auto',
            right: isMobile ? 16 : 'auto',
            zIndex: isMobile ? 1100 : 'auto',
          }}>
            <Tooltip title="Clear non-favorite images">
              <IconButton 
                onClick={handleClearImages}
                color="primary"
                sx={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  },
                  boxShadow: isMobile ? 1 : 0,
                }}
                size={isMobile ? "small" : "medium"}
              >
                <DeleteSweepIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Settings">
              <IconButton 
                onClick={handleOpenSettings}
                color="primary"
                sx={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  },
                  boxShadow: isMobile ? 1 : 0,
                }}
                size={isMobile ? "small" : "medium"}
              >
                <SettingsIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            </Tooltip>
          </Box>
          
          <Box 
            sx={{ 
              flexGrow: 1, // Take remaining space
              mt: isMobile ? 5 : 0, // Add margin top on mobile to account for floating buttons
              width: '100%', // Ensure full width
              overflow: 'hidden', // Container shouldn't scroll
              display: 'flex', // Use flexbox
              flexDirection: 'column', // Stack children vertically
            }}
          >
            <ImageGallery 
              images={images} 
              toggleFavorite={toggleFavorite} 
              newImageId={newImageId}
            />
          </Box>
        </Box>
        
        {/* Floating notification for image generation */}
        {(isLoading || requestQueue.length > 0) && (
          <Paper
            elevation={3}
            sx={{
              position: 'fixed',
              bottom: isMobile ? 16 : 24,
              right: isMobile ? 16 : 24,
              zIndex: 9999, // Ensure it's on top of everything
              p: isMobile ? 1.5 : 2,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
              backdropFilter: 'blur(10px)',
              animation: 'fadeIn 0.3s ease-out',
              maxWidth: isMobile ? 'calc(100% - 32px)' : 'auto',
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
            <CircularProgress size={isMobile ? 20 : 24} sx={{ mr: 1.5, color: 'primary.main' }} />
            <Typography variant={isMobile ? "body2" : "body1"}>
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
